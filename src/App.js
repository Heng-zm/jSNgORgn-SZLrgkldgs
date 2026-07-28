import { createElement, useCallback, useEffect, useRef } from "react";
import {
  AUDIO_BYTE_LENGTH,
  AUDIO_FILE_NAME,
  AUDIO_MIME_TYPE,
} from "./audioData.js";
import { AudioApiError, downloadAudio, fetchAudioMetadata } from "./audioApi.js";
import { AUDIO_POLL_MS } from "./config.js";

function decodeEmbeddedAudioWithWorker({ signal }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./audioDecoder.worker.js", import.meta.url),
      { type: "module" }
    );

    let settled = false;

    const cleanup = () => {
      worker.removeEventListener("message", handleMessage);
      worker.removeEventListener("error", handleWorkerError);
      signal?.removeEventListener("abort", handleAbort);
      worker.terminate();
    };

    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleMessage = (event) => {
      const message = event.data;
      if (message?.type === "complete") {
        finishResolve(
          new Blob(message.buffers, {
            type: message.mimeType || AUDIO_MIME_TYPE,
          })
        );
      } else if (message?.type === "error") {
        finishReject(new Error(message.message || "Unable to decode audio."));
      }
    };

    const handleWorkerError = (event) => {
      finishReject(
        new Error(event.message || "The embedded-audio worker failed.")
      );
    };

    const handleAbort = () => {
      finishReject(
        new DOMException("Embedded audio decoding was cancelled.", "AbortError")
      );
    };

    if (signal?.aborted) {
      handleAbort();
      return;
    }

    worker.addEventListener("message", handleMessage);
    worker.addEventListener("error", handleWorkerError);
    signal?.addEventListener("abort", handleAbort, { once: true });
    worker.postMessage({ type: "decode" });
  });
}

function waitForAudioReady(audio, signal) {
  return new Promise((resolve, reject) => {
    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      resolve();
      return;
    }

    let settled = false;
    const timeoutId = window.setTimeout(() => {
      finishReject(new Error("The browser timed out while loading the audio."));
    }, 20_000);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      audio.removeEventListener("loadedmetadata", handleReady);
      audio.removeEventListener("canplay", handleReady);
      audio.removeEventListener("error", handleError);
      signal?.removeEventListener("abort", handleAbort);
    };

    const finishResolve = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const handleReady = () => finishResolve();
    const handleError = () =>
      finishReject(new Error("The browser rejected the downloaded audio."));
    const handleAbort = () =>
      finishReject(new DOMException("Audio loading was cancelled.", "AbortError"));

    audio.addEventListener("loadedmetadata", handleReady, { once: true });
    audio.addEventListener("canplay", handleReady, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function safelySetMediaSessionAction(action, handler) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // The browser implements Media Session but not this specific action.
  }
}

export default function App() {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const readyRef = useRef(false);
  const mountedRef = useRef(false);
  const wantsPlaybackRef = useRef(true);
  const currentVersionRef = useRef("");
  const currentMetadataRef = useRef(null);
  const remoteRequestRef = useRef(null);
  const applyRequestRef = useRef(null);
  const remoteLoadingRef = useRef(false);

  const updateMediaPosition = useCallback(() => {
    const audio = audioRef.current;
    if (
      !audio ||
      !("mediaSession" in navigator) ||
      typeof navigator.mediaSession.setPositionState !== "function"
    ) {
      return;
    }

    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;

    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate:
          Number.isFinite(audio.playbackRate) && audio.playbackRate > 0
            ? audio.playbackRate
            : 1,
        position: Math.min(
          Math.max(Number.isFinite(audio.currentTime) ? audio.currentTime : 0, 0),
          audio.duration
        ),
      });
    } catch {
      // Position can be temporarily invalid while the source changes.
    }
  }, []);

  const updateMediaMetadata = useCallback((metadata) => {
    if (!("mediaSession" in navigator) || typeof MediaMetadata !== "function") {
      return;
    }

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Background Audio",
        artist: "",
        album: metadata?.fileName || AUDIO_FILE_NAME,
      });
    } catch {
      // Metadata is optional and must never stop playback.
    }
  }, []);

  const playAudio = useCallback(
    async ({ forceUnmuted = false } = {}) => {
      const audio = audioRef.current;
      if (
        !audio ||
        !readyRef.current ||
        !audio.src ||
        !wantsPlaybackRef.current
      ) {
        return false;
      }

      if (forceUnmuted) {
        audio.muted = false;
        audio.volume = 1;
      }

      try {
        await audio.play();
        if (!mountedRef.current) return false;

        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
        updateMediaPosition();
        return true;
      } catch (error) {
        if (
          error instanceof DOMException &&
          ["NotAllowedError", "AbortError"].includes(error.name)
        ) {
          return false;
        }
        console.error("Audio playback failed:", error);
        return false;
      }
    },
    [updateMediaPosition]
  );

  const applyAudioBlob = useCallback(
    async (blob, metadata) => {
      const audio = audioRef.current;
      if (!audio || !mountedRef.current) return false;

      applyRequestRef.current?.abort();
      const controller = new AbortController();
      applyRequestRef.current = controller;

      const previousUrl = objectUrlRef.current;
      const previousSource = audio.src;
      const previousReady = readyRef.current;
      const newUrl = URL.createObjectURL(blob);

      readyRef.current = false;
      audio.pause();
      audio.src = newUrl;
      audio.load();

      try {
        await waitForAudioReady(audio, controller.signal);

        if (!mountedRef.current || controller.signal.aborted) {
          URL.revokeObjectURL(newUrl);
          return false;
        }

        objectUrlRef.current = newUrl;
        currentVersionRef.current = metadata.version;
        currentMetadataRef.current = metadata;
        readyRef.current = true;
        updateMediaMetadata(metadata);

        if (previousUrl && previousUrl !== newUrl) {
          URL.revokeObjectURL(previousUrl);
        }

        if (wantsPlaybackRef.current) {
          await playAudio();
        }
        return true;
      } catch (error) {
        URL.revokeObjectURL(newUrl);

        if (
          previousSource &&
          mountedRef.current &&
          !(error instanceof DOMException && error.name === "AbortError")
        ) {
          audio.src = previousSource;
          audio.load();
          readyRef.current = previousReady;
          if (previousReady && wantsPlaybackRef.current) {
            void playAudio();
          }
        }

        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Unable to switch audio source:", error);
        }
        return false;
      } finally {
        if (applyRequestRef.current === controller) {
          applyRequestRef.current = null;
        }
      }
    },
    [playAudio, updateMediaMetadata]
  );

  const loadRemoteAudio = useCallback(
    async ({ retryVersionChange = true } = {}) => {
      if (!mountedRef.current || remoteLoadingRef.current) return false;

      remoteLoadingRef.current = true;
      remoteRequestRef.current?.abort();
      const controller = new AbortController();
      remoteRequestRef.current = controller;

      try {
        const metadata = await fetchAudioMetadata({
          signal: controller.signal,
        });

        if (!metadata.available || !mountedRef.current) return false;
        if (metadata.version === currentVersionRef.current) return true;

        const blob = await downloadAudio(metadata, {
          signal: controller.signal,
        });

        return await applyAudioBlob(blob, metadata);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return false;
        }

        if (
          retryVersionChange &&
          error instanceof AudioApiError &&
          error.code === "version_changed"
        ) {
          remoteLoadingRef.current = false;
          return loadRemoteAudio({ retryVersionChange: false });
        }

        console.warn("Remote audio is currently unavailable:", error);
        return false;
      } finally {
        if (remoteRequestRef.current === controller) {
          remoteRequestRef.current = null;
        }
        remoteLoadingRef.current = false;
      }
    },
    [applyAudioBlob]
  );

  useEffect(() => {
    mountedRef.current = true;
    const fallbackController = new AbortController();
    const audio = audioRef.current;

    const handleUserInteraction = () => {
      if (wantsPlaybackRef.current) {
        void playAudio({ forceUnmuted: true });
      }
    };

    const recoverPlayback = () => {
      if (
        document.visibilityState === "visible" &&
        wantsPlaybackRef.current &&
        audioRef.current?.paused
      ) {
        void playAudio();
      }
    };

    const handlePlay = () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
      updateMediaPosition();
    };

    const handlePause = () => {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
    };

    window.addEventListener("pointerdown", handleUserInteraction);
    window.addEventListener("keydown", handleUserInteraction);
    window.addEventListener("pageshow", recoverPlayback);
    window.addEventListener("focus", recoverPlayback);
    document.addEventListener("visibilitychange", recoverPlayback);

    audio?.addEventListener("play", handlePlay);
    audio?.addEventListener("pause", handlePause);
    audio?.addEventListener("loadedmetadata", updateMediaPosition);
    audio?.addEventListener("durationchange", updateMediaPosition);
    audio?.addEventListener("ratechange", updateMediaPosition);
    audio?.addEventListener("timeupdate", updateMediaPosition);

    safelySetMediaSessionAction("play", () => {
      wantsPlaybackRef.current = true;
      void playAudio();
    });
    safelySetMediaSessionAction("pause", () => {
      wantsPlaybackRef.current = false;
      audioRef.current?.pause();
    });
    safelySetMediaSessionAction("stop", () => {
      wantsPlaybackRef.current = false;
      const currentAudio = audioRef.current;
      if (!currentAudio) return;
      currentAudio.pause();
      currentAudio.currentTime = 0;
      updateMediaPosition();
    });
    safelySetMediaSessionAction("seekbackward", (details) => {
      const currentAudio = audioRef.current;
      if (!currentAudio || !Number.isFinite(currentAudio.duration)) return;
      currentAudio.currentTime = Math.max(
        currentAudio.currentTime - (details.seekOffset ?? 10),
        0
      );
      updateMediaPosition();
    });
    safelySetMediaSessionAction("seekforward", (details) => {
      const currentAudio = audioRef.current;
      if (!currentAudio || !Number.isFinite(currentAudio.duration)) return;
      currentAudio.currentTime = Math.min(
        currentAudio.currentTime + (details.seekOffset ?? 10),
        currentAudio.duration
      );
      updateMediaPosition();
    });
    safelySetMediaSessionAction("seekto", (details) => {
      const currentAudio = audioRef.current;
      if (
        !currentAudio ||
        !Number.isFinite(currentAudio.duration) ||
        !Number.isFinite(details.seekTime)
      ) {
        return;
      }
      const target = Math.min(
        Math.max(details.seekTime, 0),
        currentAudio.duration
      );
      if (details.fastSeek && typeof currentAudio.fastSeek === "function") {
        currentAudio.fastSeek(target);
      } else {
        currentAudio.currentTime = target;
      }
      updateMediaPosition();
    });

    const prepareInitialAudio = async () => {
      const loadedRemote = await loadRemoteAudio();
      if (loadedRemote || !mountedRef.current) return;

      try {
        const fallbackBlob = await decodeEmbeddedAudioWithWorker({
          signal: fallbackController.signal,
        });

        if (!mountedRef.current) return;
        if (fallbackBlob.size !== AUDIO_BYTE_LENGTH) {
          throw new Error(
            `Embedded audio size mismatch: expected ${AUDIO_BYTE_LENGTH}, received ${fallbackBlob.size}.`
          );
        }

        await applyAudioBlob(fallbackBlob, {
          version: "embedded-fallback",
          fileName: AUDIO_FILE_NAME,
          mimeType: AUDIO_MIME_TYPE,
          byteLength: AUDIO_BYTE_LENGTH,
          sha256: "",
          updatedAt: "",
        });

        if (wantsPlaybackRef.current) {
          await playAudio({ forceUnmuted: true });
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("Unable to restore the fallback audio:", error);
        }
      }
    };

    void prepareInitialAudio();
    const pollId = window.setInterval(() => {
      void loadRemoteAudio();
    }, AUDIO_POLL_MS);

    return () => {
      mountedRef.current = false;
      readyRef.current = false;
      fallbackController.abort();
      remoteRequestRef.current?.abort();
      applyRequestRef.current?.abort();
      remoteLoadingRef.current = false;
      window.clearInterval(pollId);

      window.removeEventListener("pointerdown", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
      window.removeEventListener("pageshow", recoverPlayback);
      window.removeEventListener("focus", recoverPlayback);
      document.removeEventListener("visibilitychange", recoverPlayback);

      audio?.removeEventListener("play", handlePlay);
      audio?.removeEventListener("pause", handlePause);
      audio?.removeEventListener("loadedmetadata", updateMediaPosition);
      audio?.removeEventListener("durationchange", updateMediaPosition);
      audio?.removeEventListener("ratechange", updateMediaPosition);
      audio?.removeEventListener("timeupdate", updateMediaPosition);

      for (const action of [
        "play",
        "pause",
        "stop",
        "seekbackward",
        "seekforward",
        "seekto",
      ]) {
        safelySetMediaSessionAction(action, null);
      }

      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = "none";
      }

      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [
    applyAudioBlob,
    loadRemoteAudio,
    playAudio,
    updateMediaPosition,
  ]);

  return createElement(
    "main",
    {
      className: "page",
      "aria-label": "Background audio page",
    },
    createElement("audio", {
      ref: audioRef,
      autoPlay: true,
      loop: true,
      playsInline: true,
      preload: "auto",
      onError: () => {
        console.error("The browser could not play the selected audio format.");
      },
    })
  );
}

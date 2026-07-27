import { useCallback, useEffect, useRef } from "react";
import {
  AUDIO_BYTE_LENGTH,
  AUDIO_FILE_NAME,
  AUDIO_MIME_TYPE,
} from "./audioData";

function decodeAudioWithWorker({ signal }) {
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
        return;
      }

      if (message?.type === "error") {
        finishReject(new Error(message.message || "Unable to decode audio."));
      }
    };

    const handleWorkerError = (event) => {
      finishReject(
        new Error(event.message || "The audio decoder worker failed.")
      );
    };

    const handleAbort = () => {
      finishReject(
        new DOMException("Audio decoding was cancelled.", "AbortError")
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

function safelySetMediaSessionAction(action, handler) {
  if (!("mediaSession" in navigator)) {
    return;
  }

  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // The browser recognizes Media Session but does not support this action.
  }
}

export default function App() {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const readyRef = useRef(false);
  const mountedRef = useRef(false);
  const wantsPlaybackRef = useRef(true);

  const updateMediaPosition = useCallback(() => {
    const audio = audioRef.current;

    if (
      !audio ||
      !("mediaSession" in navigator) ||
      typeof navigator.mediaSession.setPositionState !== "function"
    ) {
      return;
    }

    const duration = audio.duration;

    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const position = Math.min(
      Math.max(Number.isFinite(audio.currentTime) ? audio.currentTime : 0, 0),
      duration
    );

    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate:
          Number.isFinite(audio.playbackRate) && audio.playbackRate > 0
            ? audio.playbackRate
            : 1,
        position,
      });
    } catch {
      // Some browsers reject position updates while media is changing state.
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

        if (!mountedRef.current) {
          return false;
        }

        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }

        updateMediaPosition();
        return true;
      } catch (error) {
        if (
          error instanceof DOMException &&
          (error.name === "NotAllowedError" || error.name === "AbortError")
        ) {
          return false;
        }

        console.error("Audio playback failed:", error);
        return false;
      }
    },
    [updateMediaPosition]
  );

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    const decodeController = new AbortController();

    const audio = audioRef.current;

    const handleUserInteraction = () => {
      if (!wantsPlaybackRef.current) {
        return;
      }

      void playAudio({ forceUnmuted: true });
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

    const handleEnded = () => {
      if (!wantsPlaybackRef.current || !audioRef.current) {
        return;
      }

      audioRef.current.currentTime = 0;
      void playAudio();
    };

    window.addEventListener("pointerdown", handleUserInteraction);
    window.addEventListener("keydown", handleUserInteraction);
    window.addEventListener("pageshow", recoverPlayback);
    window.addEventListener("focus", recoverPlayback);
    document.addEventListener("visibilitychange", recoverPlayback);

    audio?.addEventListener("play", handlePlay);
    audio?.addEventListener("pause", handlePause);
    audio?.addEventListener("ended", handleEnded);
    audio?.addEventListener("loadedmetadata", updateMediaPosition);
    audio?.addEventListener("durationchange", updateMediaPosition);
    audio?.addEventListener("ratechange", updateMediaPosition);
    audio?.addEventListener("timeupdate", updateMediaPosition);

    if ("mediaSession" in navigator) {
      if (typeof MediaMetadata === "function") {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: "Background Audio",
          artist: "",
          album: AUDIO_FILE_NAME,
        });
      }

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

        const amount = details.seekOffset ?? 10;
        currentAudio.currentTime = Math.max(currentAudio.currentTime - amount, 0);
        updateMediaPosition();
      });

      safelySetMediaSessionAction("seekforward", (details) => {
        const currentAudio = audioRef.current;
        if (!currentAudio || !Number.isFinite(currentAudio.duration)) return;

        const amount = details.seekOffset ?? 10;
        currentAudio.currentTime = Math.min(
          currentAudio.currentTime + amount,
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
    }

    const prepareAudio = async () => {
      try {
        const audioBlob = await decodeAudioWithWorker({
          signal: decodeController.signal,
        });

        if (cancelled || !mountedRef.current) {
          return;
        }

        if (audioBlob.size !== AUDIO_BYTE_LENGTH) {
          throw new Error(
            `Audio size validation failed. Expected ${AUDIO_BYTE_LENGTH}, received ${audioBlob.size}.`
          );
        }

        const objectUrl = URL.createObjectURL(audioBlob);
        objectUrlRef.current = objectUrl;

        const currentAudio = audioRef.current;

        if (!currentAudio) {
          throw new Error("The audio element is unavailable.");
        }

        currentAudio.src = objectUrl;
        currentAudio.load();
        readyRef.current = true;

        if (wantsPlaybackRef.current) {
          await playAudio({ forceUnmuted: true });
        }
      } catch (error) {
        if (
          cancelled ||
          !mountedRef.current ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }

        console.error("Unable to restore embedded audio:", error);
      }
    };

    void prepareAudio();

    return () => {
      cancelled = true;
      decodeController.abort();
      mountedRef.current = false;
      readyRef.current = false;

      window.removeEventListener("pointerdown", handleUserInteraction);
      window.removeEventListener("keydown", handleUserInteraction);
      window.removeEventListener("pageshow", recoverPlayback);
      window.removeEventListener("focus", recoverPlayback);
      document.removeEventListener("visibilitychange", recoverPlayback);

      audio?.removeEventListener("play", handlePlay);
      audio?.removeEventListener("pause", handlePause);
      audio?.removeEventListener("ended", handleEnded);
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
  }, [playAudio, updateMediaPosition]);

  return (
    <main className="page" aria-label="Background audio page">
      <audio
        ref={audioRef}
        autoPlay
        loop
        playsInline
        preload="auto"
        onError={() => {
          console.error("The browser could not play the restored audio format.");
        }}
      />
    </main>
  );
}

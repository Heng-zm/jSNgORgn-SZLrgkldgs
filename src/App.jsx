import { useCallback, useEffect, useRef } from "react";
import {
  AUDIO_BYTE_LENGTH,
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

export default function App() {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const readyRef = useRef(false);
  const mountedRef = useRef(false);
  const unlockCleanupRef = useRef(() => {});

  const removeUnlockListeners = useCallback(() => {
    unlockCleanupRef.current();
    unlockCleanupRef.current = () => {};
  }, []);

  const playAudio = useCallback(
    async ({ forceUnmuted = false } = {}) => {
      const audio = audioRef.current;

      if (!audio || !readyRef.current || !audio.src) {
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

        removeUnlockListeners();
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
    [removeUnlockListeners]
  );

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    const decodeController = new AbortController();

    const unlockAudio = () => {
      void playAudio({ forceUnmuted: true });
    };

    window.addEventListener("pointerdown", unlockAudio);
    window.addEventListener("keydown", unlockAudio);

    unlockCleanupRef.current = () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };

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

        const audio = audioRef.current;

        if (!audio) {
          throw new Error("The audio element is unavailable.");
        }

        audio.src = objectUrl;
        audio.load();
        readyRef.current = true;

        await playAudio({ forceUnmuted: true });
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
      removeUnlockListeners();

      const audio = audioRef.current;

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
  }, [playAudio, removeUnlockListeners]);

  return (
    <main className="page" aria-label="Audio page">
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

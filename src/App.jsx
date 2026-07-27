import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUDIO_BYTE_LENGTH,
  AUDIO_FILE_NAME,
  AUDIO_MIME_TYPE,
  AUDIO_SHA256,
} from "./audioData";

const INITIAL_STATUS = "Restoring embedded audio…";

function Icon({ name, size = 20 }) {
  const paths = {
    pause: (
      <>
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </>
    ),
    play: <path d="M8 5v14l11-7z" />,
    volume: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M18 6a9 9 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
    muted: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="m16 9 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
    >
      {paths[name]}
    </svg>
  );
}

function formatBytes(byteLength) {
  if (!Number.isFinite(byteLength) || byteLength < 0) {
    return "Unknown size";
  }

  if (byteLength < 1024) {
    return `${byteLength.toLocaleString("en-US")} bytes`;
  }

  const units = ["KB", "MB", "GB"];
  let value = byteLength / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  })} ${units[unitIndex]}`;
}

function decodeAudioWithWorker({ onProgress, signal }) {
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

      if (message?.type === "progress") {
        const percentage = Math.round(
          (message.completed / Math.max(message.total, 1)) * 100
        );
        onProgress(percentage);
        return;
      }

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
      finishReject(new DOMException("Audio decoding was cancelled.", "AbortError"));
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
  const mountedRef = useRef(false);
  const readyRef = useRef(false);
  const unlockCleanupRef = useRef(() => {});

  const [status, setStatus] = useState(INITIAL_STATUS);
  const [decodeProgress, setDecodeProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);

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
        setIsMuted(false);
      }

      try {
        await audio.play();

        if (!mountedRef.current) {
          return false;
        }

        setHasError(false);
        setIsPlaying(true);
        setStatus("Audio is playing.");
        removeUnlockListeners();
        return true;
      } catch (error) {
        if (!mountedRef.current) {
          return false;
        }

        setIsPlaying(false);

        if (error instanceof DOMException && error.name === "NotAllowedError") {
          setStatus(
            "Autoplay was blocked. Click or tap anywhere once to enable sound."
          );
        } else if (error instanceof DOMException && error.name === "AbortError") {
          setStatus("Audio is ready.");
        } else {
          console.error("Audio playback failed:", error);
          setHasError(true);
          setStatus("The restored audio could not be played.");
        }

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
        setStatus(INITIAL_STATUS);
        setDecodeProgress(0);
        setHasError(false);

        const audioBlob = await decodeAudioWithWorker({
          signal: decodeController.signal,
          onProgress: (percentage) => {
            if (!cancelled && mountedRef.current) {
              setDecodeProgress(percentage);
              setStatus(`Restoring embedded audio… ${percentage}%`);
            }
          },
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
        setDecodeProgress(100);
        setStatus("Audio is ready. Starting playback…");
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
        setHasError(true);
        setStatus(
          error instanceof Error
            ? `Unable to restore audio: ${error.message}`
            : "Unable to restore the embedded audio."
        );
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

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!audio || !readyRef.current) {
      return;
    }

    if (audio.paused) {
      await playAudio({ forceUnmuted: false });
    } else {
      audio.pause();
      setStatus("Audio is paused.");
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;

    if (!audio || !readyRef.current) {
      return;
    }

    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
    setStatus(audio.muted ? "Audio is muted." : "Audio sound is enabled.");
  };

  return (
    <main className="page">
      <audio
        ref={audioRef}
        loop
        playsInline
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => {
          setHasError(true);
          setStatus("The browser could not decode the restored audio format.");
        }}
      />

      <section className={`card ${hasError ? "has-error" : ""}`}>
        <div
          className={`visualizer ${isPlaying ? "active" : ""}`}
          aria-hidden="true"
        >
          {Array.from({ length: 20 }, (_, index) => (
            <span
              key={index}
              style={{ "--delay": `${index * 0.045}s` }}
            />
          ))}
        </div>

        <div className="audio-icon" aria-hidden="true">
          {isMuted ? <Icon name="muted" size={35} /> : <Icon name="volume" size={35} />}
        </div>

        <p className="eyebrow">EMBEDDED BINARY AUDIO</p>
        <h1>Welcome</h1>
        <p className="file-name">
          {AUDIO_FILE_NAME} · {formatBytes(AUDIO_BYTE_LENGTH)}
        </p>

        {decodeProgress < 100 && !hasError ? (
          <progress
            className="decode-progress"
            max="100"
            value={decodeProgress}
            aria-label="Audio decoding progress"
          />
        ) : null}

        <p className="status" role="status" aria-live="polite">
          {status}
        </p>

        <div className="controls">
          <button
            type="button"
            onClick={togglePlayback}
            disabled={!readyRef.current || hasError}
          >
            {isPlaying ? <Icon name="pause" size={19} /> : <Icon name="play" size={19} />}
            {isPlaying ? "Pause" : "Play"}
          </button>

          <button
            className="secondary"
            type="button"
            onClick={toggleMute}
            disabled={!readyRef.current || hasError}
          >
            {isMuted ? <Icon name="volume" size={19} /> : <Icon name="muted" size={19} />}
            {isMuted ? "Unmute" : "Mute"}
          </button>
        </div>

        <details className="technical-details">
          <summary>Audio details</summary>
          <dl>
            <div>
              <dt>Format</dt>
              <dd>{AUDIO_MIME_TYPE}</dd>
            </div>
            <div>
              <dt>SHA-256</dt>
              <dd title={AUDIO_SHA256}>{AUDIO_SHA256.slice(0, 16)}…</dd>
            </div>
          </dl>
        </details>
      </section>
    </main>
  );
}

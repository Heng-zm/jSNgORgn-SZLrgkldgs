import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import {
  AUDIO_BASE64,
  AUDIO_FILE_NAME,
  AUDIO_MIME_TYPE,
} from "./audioData";

function base64ToAudioBlob(base64Data, mimeType) {
  const binaryString = window.atob(base64Data);
  const chunkSize = 32_768;
  const chunks = [];

  for (let offset = 0; offset < binaryString.length; offset += chunkSize) {
    const slice = binaryString.slice(offset, offset + chunkSize);
    const bytes = new Uint8Array(slice.length);

    for (let index = 0; index < slice.length; index += 1) {
      bytes[index] = slice.charCodeAt(index);
    }

    chunks.push(bytes);
  }

  return new Blob(chunks, { type: mimeType });
}

export default function App() {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);

  const [status, setStatus] = useState("Restoring embedded audio...");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const startAudio = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio || !audio.src) {
      return false;
    }

    try {
      audio.muted = false;
      audio.volume = 1;

      await audio.play();

      setIsMuted(false);
      setIsPlaying(true);
      setStatus("Audio is playing automatically.");
      return true;
    } catch (error) {
      console.warn("Autoplay was blocked by the browser:", error);
      setIsPlaying(false);
      setStatus(
        "The browser blocked autoplay. Click or tap anywhere once to enable sound."
      );
      return false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    try {
      const audioBlob = base64ToAudioBlob(
        AUDIO_BASE64,
        AUDIO_MIME_TYPE
      );

      if (cancelled) {
        return undefined;
      }

      const objectUrl = URL.createObjectURL(audioBlob);
      objectUrlRef.current = objectUrl;

      const audio = audioRef.current;

      if (audio) {
        audio.src = objectUrl;
        audio.load();
        void startAudio();
      }
    } catch (error) {
      console.error("Unable to restore embedded audio:", error);
      setStatus("Unable to restore the embedded audio.");
    }

    const unlockAudio = () => {
      void startAudio();
    };

    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    window.addEventListener("touchstart", unlockAudio, {
      once: true,
      passive: true,
    });

    return () => {
      cancelled = true;

      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      window.removeEventListener("touchstart", unlockAudio);

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
  }, [startAudio]);

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    if (audio.paused) {
      await startAudio();
    } else {
      audio.pause();
      setStatus("Audio is paused.");
    }
  };

  const toggleMute = () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    audio.muted = !audio.muted;
    setIsMuted(audio.muted);
  };

  return (
    <main className="page">
      <audio
        ref={audioRef}
        autoPlay
        loop
        playsInline
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onError={() => setStatus("The restored audio could not be played.")}
      />

      <section className="card" aria-live="polite">
        <div className={`visualizer ${isPlaying ? "active" : ""}`}>
          {Array.from({ length: 20 }, (_, index) => (
            <span
              key={index}
              style={{ "--delay": `${index * 0.045}s` }}
            />
          ))}
        </div>

        <div className="audio-icon">
          {isMuted ? <VolumeX size={35} /> : <Volume2 size={35} />}
        </div>

        <p className="eyebrow">EMBEDDED BINARY AUDIO</p>
        <h1>Welcome</h1>
        <p className="file-name">{AUDIO_FILE_NAME}</p>
        <p className="status">{status}</p>

        <div className="controls">
          <button type="button" onClick={togglePlayback}>
            {isPlaying ? <Pause size={19} /> : <Play size={19} />}
            {isPlaying ? "Pause" : "Play"}
          </button>

          <button
            className="secondary"
            type="button"
            onClick={toggleMute}
          >
            {isMuted ? <Volume2 size={19} /> : <VolumeX size={19} />}
            {isMuted ? "Unmute" : "Mute"}
          </button>
        </div>
      </section>
    </main>
  );
}

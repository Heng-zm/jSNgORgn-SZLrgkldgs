# Changelog

## 2.0.0

- Connects the white background-audio page to the supporter FastAPI backend.
- Detects audio changed through Telegram `/audio` without rebuilding React.
- Adds versioned binary downloads and SHA-256 verification.
- Keeps the previous track until a replacement is fully validated.
- Retains embedded Base64 audio as an offline/backend-failure fallback.
- Retains autoplay recovery, background playback, and Media Session controls.

## 1.3.0

- Added best-effort background playback and Media Session controls.

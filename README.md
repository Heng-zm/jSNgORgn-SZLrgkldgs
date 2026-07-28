# React Binary Audio + Telegram Backend

This React 19/Vite page remains completely solid white. It first requests the active audio from the supporter FastAPI backend. The backend audio can be replaced through Telegram `/audio`. If the backend has no audio or is temporarily unavailable, the application uses the embedded Base64 audio as a fallback.

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

Set the deployed supporter backend URL in `.env`:

```env
VITE_BACKEND_URL=https://your-supporter-backend.onrender.com
```

## Dynamic update behavior

- Requests `GET /api/audio/metadata`.
- Downloads `GET /api/audio/file?version=...` only when the version changes.
- Validates byte length and SHA-256 before switching.
- Keeps the old audio active if the new download is incomplete or invalid.
- Checks for changes every 15 seconds by default.
- Preserves background Media Session controls and the first-click autoplay fallback.

## Embedded fallback

Keep exactly one supported audio file in `assets/`, then regenerate the fallback:

```bash
npm run audio:convert
```

The embedded fallback remains Base64 encoding, not encryption.

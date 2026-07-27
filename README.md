# React Binary Audio Website

This Vite + React project converts one local audio file into Base64 chunks, stores those chunks in the application source, restores the bytes inside a Web Worker, creates a temporary Blob URL, and attempts playback when the page opens.

## Requirements

- Node.js 18 or newer
- npm

## Install and run

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The verified production files are generated in `dist/`.

## Replace the audio

Inside `assets/`, keep exactly one supported file with one of these names:

- `audio.mp3`
- `audio.wav`
- `audio.ogg`
- `audio.m4a`
- `audio.aac`
- `audio.webm`

Then run:

```bash
npm run audio:convert
```

The converter generates `src/audioData.js` with:

- Base64 chunks
- MIME type
- Original byte length
- SHA-256 identifier

The converter intentionally fails when multiple supported `audio.*` files exist so it never guesses which file should be embedded.

## Autoplay behavior

The page attempts unmuted playback as soon as decoding finishes. Some browsers block first-visit autoplay. In that case, the first later click, tap, or keypress anywhere on the page retries playback; the user does not need to click the Play button specifically.

## Performance improvements

- Decoding runs in a Web Worker instead of blocking the main interface.
- Base64 is split into valid chunks to reduce peak decoding work.
- The converter avoids rewriting unchanged generated data.
- Object URLs, event listeners, and workers are cleaned up correctly.

## Important

Base64 is encoding, not encryption. A technical user can still recover audio that their browser is able to play.

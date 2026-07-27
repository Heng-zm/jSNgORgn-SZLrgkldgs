# React Binary Audio Website

This React website displays only a solid white page. It restores an audio file embedded as Base64 binary data, attempts to play it automatically, and loops it continuously.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Replace the audio

Keep exactly one supported audio file in the `assets` folder:

- `audio.mp3`
- `audio.wav`
- `audio.ogg`
- `audio.m4a`
- `audio.aac`

Then run:

```bash
npm run audio:convert
```

The generated binary data is stored in:

```text
src/audioData.js
```

## Browser autoplay behavior

The application attempts unmuted playback when the page opens. Browsers may block this on a first visit. In that case, clicking or tapping anywhere on the white page retries playback. There is no visible Play button or player interface.

Base64 is encoding, not encryption. A technical user can still extract the embedded audio.

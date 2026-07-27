# React Binary Audio Website

This project converts an audio file into Base64 binary text, stores it in the React source, restores it as a Blob when the page opens, and attempts autoplay.

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

Put one supported file inside the `assets` folder:

- `audio.mp3`
- `audio.wav`
- `audio.ogg`
- `audio.m4a`
- `audio.aac`

Remove the old sample, add your new file, and run:

```bash
npm run audio:convert
```

The generated binary data is stored in:

```text
src/audioData.js
```

## Browser autoplay rule

Modern browsers may block unmuted autoplay on a first visit. This project requests autoplay immediately and retries after the first click, tap, or keypress anywhere on the page.

Base64 is encoding, not encryption. It embeds and hides the normal audio path, but it does not prevent a technical user from extracting the audio.
# jSNgORgn-SZLrgkldgs

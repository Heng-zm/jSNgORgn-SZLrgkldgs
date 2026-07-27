# React Binary Background Audio Website

This React website displays only a solid white page. It restores an audio file embedded as Base64 binary data, attempts to play it automatically, loops continuously, and uses the browser Media Session API for supported background and lock-screen playback controls.

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
- `audio.webm`

Then run:

```bash
npm run audio:convert
```

The generated binary data is stored in:

```text
src/audioData.js
```

## Background playback

After playback has been allowed, the audio element is designed to continue when the tab is in the background or the phone screen is locked, where the browser and operating system permit it. Supported devices can show Play, Pause, Stop, and Seek controls through the Media Session API.

The application also attempts to recover playback when the page becomes visible again after browser suspension.

A website cannot guarantee playback after the tab is closed, the browser is terminated, the operating system force-stops the browser, or the browser blocks background media. A native mobile application is required for guaranteed application-level background service behavior.

## Autoplay behavior

The application attempts unmuted playback when the page opens. Browsers may block this on a first visit. In that case, clicking or tapping anywhere on the white page retries playback. There is no visible Play button or player interface.

Base64 is encoding, not encryption. A technical user can still extract the embedded audio.

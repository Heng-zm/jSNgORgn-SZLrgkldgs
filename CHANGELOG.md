# Changelog

## 1.1.0

- Fixed the autoplay unlock listener being consumed before audio was ready.
- Fixed Play from unexpectedly unmuting audio after the user muted it.
- Moved Base64 decoding into a cancellable Web Worker.
- Split generated Base64 into valid chunks to reduce decoding pressure.
- Added byte-length validation and SHA-256 metadata.
- Added decoding progress and clearer error states.
- Added atomic generated-file writes and unchanged-file detection.
- Added strict handling for missing or multiple `assets/audio.*` files.
- Added Vite React configuration.
- Removed the unnecessary icon dependency and replaced it with local SVG icons.
- Improved cleanup for listeners, workers, audio sources, and Blob URLs.
- Updated `.gitignore` and project documentation.

# Changelog

## 1.2.0

- Removed the entire visible player interface.
- Replaced gradients and decorative styling with a solid white page.
- Removed buttons, icons, progress indicators, animations, and technical details.
- Preserved embedded binary audio decoding, autoplay attempts, looping, and first-interaction playback fallback.
- Kept worker cancellation, Blob URL cleanup, byte-length validation, and playback error logging.

## 1.1.0

- Moved Base64 decoding to a Web Worker.
- Added decoder cancellation and cleanup.
- Added byte-length and SHA-256 metadata.
- Improved autoplay fallback behavior.
- Removed the external icon dependency.

import {
  AUDIO_BASE64_CHUNKS,
  AUDIO_BYTE_LENGTH,
  AUDIO_MIME_TYPE,
} from "./audioData";

function decodeChunk(base64Chunk) {
  const binaryString = self.atob(base64Chunk);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return bytes.buffer;
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "decode") {
    return;
  }

  try {
    const buffers = [];
    let decodedByteLength = 0;

    for (let index = 0; index < AUDIO_BASE64_CHUNKS.length; index += 1) {
      const buffer = decodeChunk(AUDIO_BASE64_CHUNKS[index]);
      buffers.push(buffer);
      decodedByteLength += buffer.byteLength;

      if (
        index === AUDIO_BASE64_CHUNKS.length - 1 ||
        index % 8 === 7
      ) {
        self.postMessage({
          type: "progress",
          completed: index + 1,
          total: AUDIO_BASE64_CHUNKS.length,
        });
      }
    }

    if (decodedByteLength !== AUDIO_BYTE_LENGTH) {
      throw new Error(
        `Decoded byte length mismatch. Expected ${AUDIO_BYTE_LENGTH}, received ${decodedByteLength}.`
      );
    }

    self.postMessage(
      {
        type: "complete",
        buffers,
        mimeType: AUDIO_MIME_TYPE,
        byteLength: decodedByteLength,
      },
      buffers
    );
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "Unknown decode error",
    });
  }
});

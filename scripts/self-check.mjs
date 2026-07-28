import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

// audioApi.js is browser code. These standards-compatible globals let this
// deterministic check run without installing Vite or React.
globalThis.window = globalThis;

const source = await readFile(new URL("../assets/audio.wav", import.meta.url));
const sha256 = createHash("sha256").update(source).digest("hex");
const version = "self-check-v1";

const calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));

  if (String(url).endsWith("/api/audio/metadata")) {
    return new Response(
      JSON.stringify({
        ok: true,
        available: true,
        version,
        fileName: "audio.wav",
        mimeType: "audio/wav",
        byteLength: source.byteLength,
        sha256,
        updatedAt: "2026-07-27T00:00:00+00:00",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  if (String(url).includes(`/api/audio/file?version=${version}`)) {
    return new Response(source, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(source.byteLength),
      },
    });
  }

  return new Response("Not found", { status: 404 });
};

const { downloadAudio, fetchAudioMetadata } = await import("../src/audioApi.js");
const metadata = await fetchAudioMetadata();
const blob = await downloadAudio(metadata);

if (metadata.version !== version) {
  throw new Error("Metadata version validation failed.");
}
if (blob.size !== source.byteLength || blob.type !== "audio/wav") {
  throw new Error("Downloaded audio Blob validation failed.");
}
if (calls.length !== 2) {
  throw new Error(`Expected 2 API calls, received ${calls.length}.`);
}

console.log("Frontend audio API self-check passed.");
console.log(`Version: ${metadata.version}`);
console.log(`Bytes: ${blob.size}`);
console.log(`SHA-256: ${sha256}`);

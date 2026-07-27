import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, "..");
const assetsDirectory = path.join(projectRoot, "assets");
const outputFile = path.join(projectRoot, "src", "audioData.js");

const supportedMimeTypes = new Map([
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".webm", "audio/webm"],
]);

const BASE64_CHUNK_LENGTH = 65_536; // Must be divisible by 4.

function fail(message) {
  console.error(`\nAudio conversion failed: ${message}\n`);
  process.exit(1);
}

if (!fs.existsSync(assetsDirectory)) {
  fail(`Missing assets directory: ${assetsDirectory}`);
}

const matchingFiles = fs
  .readdirSync(assetsDirectory, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((fileName) => {
    const parsed = path.parse(fileName);
    return (
      parsed.name.toLowerCase() === "audio" &&
      supportedMimeTypes.has(parsed.ext.toLowerCase())
    );
  });

if (matchingFiles.length === 0) {
  fail(
    "No supported file was found. Add exactly one file named audio.mp3, audio.wav, audio.ogg, audio.m4a, audio.aac, or audio.webm inside assets/."
  );
}

if (matchingFiles.length > 1) {
  fail(
    `Multiple audio files were found (${matchingFiles.join(
      ", "
    )}). Keep exactly one so the converter never guesses which file to use.`
  );
}

const inputFileName = matchingFiles[0];
const inputFile = path.join(assetsDirectory, inputFileName);
const extension = path.extname(inputFileName).toLowerCase();
const mimeType = supportedMimeTypes.get(extension);
const audioBuffer = fs.readFileSync(inputFile);

if (audioBuffer.length === 0) {
  fail(`${inputFileName} is empty.`);
}

const audioBase64 = audioBuffer.toString("base64");
const base64Chunks = [];

for (
  let offset = 0;
  offset < audioBase64.length;
  offset += BASE64_CHUNK_LENGTH
) {
  base64Chunks.push(audioBase64.slice(offset, offset + BASE64_CHUNK_LENGTH));
}

const sha256 = crypto.createHash("sha256").update(audioBuffer).digest("hex");
const generatedCode = `// Generated automatically by scripts/audio-to-binary.mjs
// Replace the file in assets/ and run: npm run audio:convert

export const AUDIO_FILE_NAME = ${JSON.stringify(inputFileName)};
export const AUDIO_MIME_TYPE = ${JSON.stringify(mimeType)};
export const AUDIO_BYTE_LENGTH = ${audioBuffer.length};
export const AUDIO_SHA256 = ${JSON.stringify(sha256)};
export const AUDIO_BASE64_CHUNKS = ${JSON.stringify(base64Chunks)};
`;

const existingCode = fs.existsSync(outputFile)
  ? fs.readFileSync(outputFile, "utf8")
  : null;

if (existingCode === generatedCode) {
  console.log(`Audio data is already current: ${inputFileName}`);
  process.exit(0);
}

const temporaryOutput = `${outputFile}.tmp`;
fs.writeFileSync(temporaryOutput, generatedCode, "utf8");
fs.renameSync(temporaryOutput, outputFile);

console.log(`Converted ${inputFileName} to src/audioData.js`);
console.log(`Original size: ${audioBuffer.length.toLocaleString("en-US")} bytes`);
console.log(`Encoded chunks: ${base64Chunks.length.toLocaleString("en-US")}`);
console.log(`SHA-256: ${sha256}`);

if (audioBuffer.length > 10 * 1024 * 1024) {
  console.warn(
    "Warning: embedding audio larger than 10 MB can increase download time and JavaScript parsing cost."
  );
}

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, "..");

const supportedFiles = [
  "audio.mp3",
  "audio.wav",
  "audio.ogg",
  "audio.m4a",
  "audio.aac",
];

const mimeTypes = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

const inputFileName = supportedFiles.find((fileName) =>
  fs.existsSync(path.join(projectRoot, "assets", fileName))
);

if (!inputFileName) {
  console.error(
    "No audio file found. Add assets/audio.mp3, audio.wav, audio.ogg, audio.m4a, or audio.aac."
  );
  process.exit(1);
}

const inputFile = path.join(projectRoot, "assets", inputFileName);
const outputFile = path.join(projectRoot, "src", "audioData.js");
const extension = path.extname(inputFileName).toLowerCase();
const mimeType = mimeTypes[extension] ?? "application/octet-stream";

const audioBuffer = fs.readFileSync(inputFile);
const audioBase64 = audioBuffer.toString("base64");

const generatedCode = `// Generated automatically by scripts/audio-to-binary.mjs
// Replace the file in assets/ and run: npm run audio:convert

export const AUDIO_FILE_NAME = ${JSON.stringify(inputFileName)};
export const AUDIO_MIME_TYPE = ${JSON.stringify(mimeType)};
export const AUDIO_BASE64 = ${JSON.stringify(audioBase64)};
`;

fs.writeFileSync(outputFile, generatedCode, "utf8");

console.log(`Converted ${inputFileName} to src/audioData.js`);
console.log(`Original size: ${audioBuffer.length.toLocaleString()} bytes`);
console.log(`Base64 size: ${audioBase64.length.toLocaleString()} characters`);

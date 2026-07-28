function trimTrailingSlashes(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizePath(value, fallback) {
  const clean = String(value || fallback).trim();
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), minimum), maximum);
}

const environment = import.meta.env ?? {};

const backendUrl = trimTrailingSlashes(environment.VITE_BACKEND_URL);
const audioPath = normalizePath(
  environment.VITE_AUDIO_API_PATH,
  "/api/audio"
);

export const AUDIO_API_BASE_URL = `${backendUrl}${audioPath}`;
export const AUDIO_POLL_MS = boundedNumber(
  environment.VITE_AUDIO_POLL_MS,
  15_000,
  5_000,
  300_000
);
export const AUDIO_REQUEST_TIMEOUT_MS = boundedNumber(
  environment.VITE_AUDIO_REQUEST_TIMEOUT_MS,
  30_000,
  5_000,
  120_000
);

import {
  AUDIO_API_BASE_URL,
  AUDIO_REQUEST_TIMEOUT_MS,
} from "./config.js";

export class AudioApiError extends Error {
  constructor(message, { status = 0, code = "audio_api_error" } = {}) {
    super(message);
    this.name = "AudioApiError";
    this.status = status;
    this.code = code;
  }
}

function createRequestController(externalSignal, timeoutMs) {
  const controller = new AbortController();

  const abortFromExternal = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal?.aborted) {
    abortFromExternal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternal, { once: true });
  }

  const timeoutId = window.setTimeout(() => {
    controller.abort(
      new DOMException("The audio request timed out.", "TimeoutError")
    );
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternal);
    },
  };
}

async function parseError(response) {
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (typeof detail === "string") return detail.trim();
    if (detail && typeof detail === "object") {
      return String(detail.message || "").trim();
    }
    return String(body?.error || body?.message || "").trim();
  } catch {
    return "";
  }
}

async function requestWithTimeout(url, options, consumeResponse) {
  const { timeoutMs = AUDIO_REQUEST_TIMEOUT_MS, signal, ...requestOptions } =
    options || {};
  const request = createRequestController(signal, timeoutMs);

  try {
    const response = await fetch(url, {
      ...requestOptions,
      signal: request.signal,
    });
    // Keep the timeout and external abort listener active until the body is
    // consumed, not merely until response headers arrive.
    return await consumeResponse(response);
  } finally {
    request.cleanup();
  }
}

function normalizeMetadata(data) {
  if (!data?.available) {
    return {
      available: false,
      version: "",
    };
  }

  const metadata = {
    available: true,
    version: String(data.version || "").trim(),
    fileName: String(data.fileName || "audio").trim(),
    mimeType: String(data.mimeType || "application/octet-stream").trim(),
    byteLength: Number(data.byteLength || 0),
    sha256: String(data.sha256 || "").trim().toLowerCase(),
    updatedAt: String(data.updatedAt || "").trim(),
  };

  if (!metadata.version) {
    throw new AudioApiError("The backend returned audio without a version.", {
      code: "invalid_metadata",
    });
  }

  if (!Number.isSafeInteger(metadata.byteLength) || metadata.byteLength <= 0) {
    throw new AudioApiError("The backend returned an invalid audio byte length.", {
      code: "invalid_metadata",
    });
  }

  if (metadata.sha256 && !/^[a-f0-9]{64}$/.test(metadata.sha256)) {
    throw new AudioApiError("The backend returned an invalid audio checksum.", {
      code: "invalid_metadata",
    });
  }

  return metadata;
}

export async function fetchAudioMetadata({ signal } = {}) {
  return requestWithTimeout(
    `${AUDIO_API_BASE_URL}/metadata`,
    {
      method: "GET",
      signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    },
    async (response) => {
      if (!response.ok) {
        const detail = await parseError(response);
        throw new AudioApiError(
          detail || `Audio metadata request failed with HTTP ${response.status}.`,
          { status: response.status, code: "metadata_request_failed" }
        );
      }
      return normalizeMetadata(await response.json());
    }
  );
}

async function sha256Hex(buffer) {
  if (!globalThis.crypto?.subtle) {
    return "";
  }

  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export async function downloadAudio(metadata, { signal } = {}) {
  const version = encodeURIComponent(metadata.version);

  return requestWithTimeout(
    `${AUDIO_API_BASE_URL}/file?version=${version}`,
    {
      method: "GET",
      signal,
      cache: "force-cache",
      headers: {
        Accept: "audio/*,application/octet-stream;q=0.8",
      },
    },
    async (response) => {
      if (!response.ok) {
        const detail = await parseError(response);
        throw new AudioApiError(
          detail || `Audio download failed with HTTP ${response.status}.`,
          {
            status: response.status,
            code:
              response.status === 409 ? "version_changed" : "download_failed",
          }
        );
      }

      const contentLength = Number(response.headers.get("Content-Length") || 0);
      if (contentLength > 0 && contentLength !== metadata.byteLength) {
        throw new AudioApiError(
          `Audio response size mismatch: expected ${metadata.byteLength}, header reported ${contentLength}.`,
          { code: "size_mismatch" }
        );
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength !== metadata.byteLength) {
        throw new AudioApiError(
          `Audio size mismatch: expected ${metadata.byteLength}, received ${buffer.byteLength}.`,
          { code: "size_mismatch" }
        );
      }

      if (metadata.sha256) {
        const actualHash = await sha256Hex(buffer);
        if (actualHash && actualHash !== metadata.sha256) {
          throw new AudioApiError("Audio checksum verification failed.", {
            code: "checksum_mismatch",
          });
        }
      }

      const responseType = String(response.headers.get("Content-Type") || "")
        .split(";", 1)[0]
        .trim();

      return new Blob([buffer], {
        type: responseType || metadata.mimeType,
      });
    }
  );
}

import fs from "node:fs";
import path from "node:path";
import { isYouTubeUrl } from "./link-utils.ts";
import { checkRateLimit } from "./security.ts";
import { MAX_AUDIO_FILE_SIZE, deleteAudioFile } from "./supabase/storage.ts";

/**
 * Check if the yt-dlp binary is physically present and executable.
 */
export function isYtDlpAvailable(customBinPath?: string): boolean {
  try {
    const binPath =
      customBinPath ||
      path.resolve(process.cwd(), "node_modules/youtube-dl-exec/bin/yt-dlp");
    if (fs.existsSync(/*turbopackIgnore: true*/ binPath)) {
      return true;
    }
  } catch {
    // Ignore error
  }
  return false;
}

/**
 * Format YouTube extractor errors into user-friendly, actionable messages.
 */
export function formatYouTubeError(err: unknown): { message: string; status: number } {
  const rawMsg = err instanceof Error ? err.message : String(err);
  const lowerMsg = rawMsg.toLowerCase();

  if (
    lowerMsg.includes("sign in to confirm") ||
    lowerMsg.includes("bot verification")
  ) {
    return {
      message:
        "YouTube blocked this automated server request with a bot verification challenge. To protect your access, please bookmark the track to open directly, or upload the audio file.",
      status: 422,
    };
  }

  if (
    lowerMsg.includes("ffprobe and ffmpeg not found") ||
    lowerMsg.includes("ffmpeg not found")
  ) {
    return {
      message:
        "Audio conversion dependency (ffmpeg) is not installed in the server environment. Raw audio streams can be bookmarked or direct audio files can be uploaded.",
      status: 501,
    };
  }

  if (
    lowerMsg.includes("enoent") ||
    lowerMsg.includes("spawn") ||
    lowerMsg.includes("extraction engine unavailable") ||
    lowerMsg.includes("downloader not found")
  ) {
    return {
      message:
        "Audio extraction engine is not available in the current serverless runtime environment. Please save as a YouTube bookmark or upload your audio file directly.",
      status: 501,
    };
  }

  if (
    lowerMsg.includes("private video") ||
    lowerMsg.includes("video unavailable") ||
    lowerMsg.includes("unavailable") ||
    lowerMsg.includes("does not exist") ||
    lowerMsg.includes("not found") ||
    lowerMsg.includes("404")
  ) {
    return {
      message: "This YouTube video is unavailable, private, or does not exist.",
      status: 404,
    };
  }

  return {
    message: `YouTube error: ${rawMsg.split("\n")[0] || "Failed to process video"}`,
    status: 422,
  };
}

/**
 * Fetch video metadata via YouTube's official oEmbed endpoint.
 * Serverless-compatible, requires no executables or cookies.
 */
export async function fetchOEmbedMetadata(
  url: string,
  customFetch: typeof fetch = fetch
): Promise<{
  title: string;
  artist: string;
  thumbnail?: string;
}> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    url.trim()
  )}&format=json`;

  const res = await customFetch(oembedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SijomonsMusic/1.0)",
    },
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("This YouTube video is unavailable, private, or does not exist.");
    }
    throw new Error(`YouTube oEmbed responded with status ${res.status}`);
  }

  const data = await res.json();
  return {
    title: data.title || "YouTube Video",
    artist: data.author_name || "YouTube",
    thumbnail: data.thumbnail_url,
  };
}

/**
 * Validates request input and environment for YouTube extraction operations.
 */
export function validateYouTubeExtractionInput(params: {
  url?: unknown;
  isStorageConfigured: boolean;
  clientIp?: string;
}): { valid: boolean; status: number; error?: string; cleanUrl?: string } {
  // Check rate limit if IP provided
  if (params.clientIp && !checkRateLimit(params.clientIp, 30, 60 * 1000)) {
    return {
      valid: false,
      status: 429,
      error: "Too many extraction requests. Please wait a moment and try again.",
    };
  }

  // Check Supabase storage configuration
  if (!params.isStorageConfigured) {
    return {
      valid: false,
      status: 503,
      error:
        "Supabase Storage is not configured. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your environment.",
    };
  }

  // Validate URL format
  const trimmedUrl = typeof params.url === "string" ? params.url.trim() : "";
  if (!trimmedUrl || !isYouTubeUrl(trimmedUrl)) {
    return {
      valid: false,
      status: 400,
      error: "Invalid YouTube link. Please provide a valid youtube.com or youtu.be URL.",
    };
  }

  return {
    valid: true,
    status: 200,
    cleanUrl: trimmedUrl,
  };
}

/**
 * Verifies that the extracted audio does not exceed the Supabase 50MB free tier file size limit.
 */
export function checkFileSizeLimit(
  fileSizeBytes: number,
  maxBytes: number = MAX_AUDIO_FILE_SIZE
): { ok: boolean; status: number; error?: string } {
  if (fileSizeBytes > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: `Extracted audio is ${(fileSizeBytes / 1024 / 1024).toFixed(
        1
      )} MB, which exceeds the Supabase Free plan limit of ${(
        maxBytes /
        1024 /
        1024
      ).toFixed(0)} MB per file.`,
    };
  }
  return { ok: true, status: 200 };
}

/**
 * Rolls back an uploaded storage file when the corresponding database insertion fails.
 */
export async function rollbackUploadedAudio(
  storagePath: string,
  deleteFn: (path: string) => Promise<{ success: boolean } | boolean> = deleteAudioFile
): Promise<boolean> {
  try {
    const res = await deleteFn(storagePath);
    return typeof res === "boolean" ? res : Boolean(res?.success);
  } catch (err) {
    console.warn("Storage rollback failed for path:", storagePath, err);
    return false;
  }
}

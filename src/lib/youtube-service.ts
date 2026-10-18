import fs from "node:fs";
import path from "node:path";
import youtubedl from "youtube-dl-exec";
import {
  isYouTubeUrl,
  extractYouTubeVideoId,
  extractYouTubePlaylistId,
} from "./link-utils.ts";
import { checkRateLimit } from "./security.ts";
import { MAX_AUDIO_FILE_SIZE, deleteAudioFile } from "./supabase/storage.ts";
import type {
  YouTubePlaylistItem,
  YouTubePlaylistInspection,
} from "./types.ts";

/**
 * Detect whether the executable binary is a native standalone ELF/Mach-O/PE binary
 * rather than a Python script or zipapp (which requires system python3).
 */
export function isBinaryStandalone(filePath: string): boolean {
  try {
    if (!fs.existsSync(/*turbopackIgnore: true*/ filePath)) return false;
    const fd = fs.openSync(/*turbopackIgnore: true*/ filePath, "r");
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);
    // Linux ELF: \x7fELF (0x7F, 0x45, 0x4C, 0x46)
    if (
      buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46
    ) {
      return true;
    }
    // Windows PE: MZ (0x4D, 0x5A)
    if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
      return true;
    }
    // Mach-O (macOS): 0xfeedface, 0xfeedfacf, 0xcafebabe
    if (
      (buffer[0] === 0xfe && buffer[1] === 0xed) ||
      (buffer[0] === 0xcf && buffer[1] === 0xfa) ||
      (buffer[0] === 0xca && buffer[1] === 0xfe)
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolves the path to the yt-dlp executable.
 * In serverless environments (e.g. Vercel Lambda where /var/task is read-only),
 * prepares and copies the binary into /tmp/yt-dlp with +x execute permissions if needed.
 */
export function getYtDlpExecutablePath(customBinPath?: string): string | null {
  try {
    const isServerless = Boolean(
      process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
    );

    // If a custom bin path was explicitly provided
    if (customBinPath !== undefined) {
      return fs.existsSync(/*turbopackIgnore: true*/ customBinPath) ? customBinPath : null;
    }

    // If explicit environment variable is set
    if (process.env.YT_DLP_PATH && fs.existsSync(/*turbopackIgnore: true*/ process.env.YT_DLP_PATH)) {
      return process.env.YT_DLP_PATH;
    }

    // Candidate locations
    const candidates = [
      path.resolve(process.cwd(), "bin/yt-dlp"),
      path.resolve(process.cwd(), "bin/yt-dlp.exe"),
      path.resolve(process.cwd(), "node_modules/youtube-dl-exec/bin/yt-dlp"),
      path.resolve(process.cwd(), "node_modules/youtube-dl-exec/bin/yt-dlp.exe"),
      "/tmp/yt-dlp",
    ];

    let foundPath: string | null = null;
    for (const candidate of candidates) {
      if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
        foundPath = candidate;
        break;
      }
    }

    if (!foundPath) {
      return null;
    }

    // In Serverless / Vercel: /var/task is mounted read-only and may lack execute permissions.
    // /tmp is the guaranteed writable POSIX filesystem where chmod +x works reliably.
    if (isServerless) {
      const tmpTarget = "/tmp/yt-dlp";
      try {
        let needCopy = true;
        if (fs.existsSync(/*turbopackIgnore: true*/ tmpTarget)) {
          const srcStat = fs.statSync(/*turbopackIgnore: true*/ foundPath);
          const tmpStat = fs.statSync(/*turbopackIgnore: true*/ tmpTarget);
          if (srcStat.size === tmpStat.size) {
            needCopy = false;
          }
        }

        if (needCopy) {
          fs.copyFileSync(foundPath, tmpTarget);
          fs.chmodSync(/*turbopackIgnore: true*/ tmpTarget, 0o755);
        }
        return tmpTarget;
      } catch (copyErr) {
        console.warn("[yt-dlp] Warning: Could not prepare in /tmp, using source path:", copyErr);
      }
    } else {
      // Local development: ensure execute permission if needed
      try {
        fs.accessSync(/*turbopackIgnore: true*/ foundPath, fs.constants.X_OK);
      } catch {
        try {
          fs.chmodSync(/*turbopackIgnore: true*/ foundPath, 0o755);
        } catch {
          // Ignore if unable to chmod
        }
      }
    }

    return foundPath;
  } catch {
    return null;
  }
}

/**
 * Returns a configured youtubedl runner instance executing the standalone binary directly.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getYtDlpRunner(customBinPath?: string): any {
  const binPath = getYtDlpExecutablePath(customBinPath);
  if (!binPath) {
    throw new Error(
      "Audio extraction engine (yt-dlp) is not available in the deployment environment (ENOENT)."
    );
  }
  return youtubedl.create(binPath);
}

/**
 * Check if the yt-dlp binary is physically present and executable.
 */
export function isYtDlpAvailable(customBinPath?: string): boolean {
  try {
    const binPath = getYtDlpExecutablePath(customBinPath);
    if (!binPath) return false;
    return fs.existsSync(/*turbopackIgnore: true*/ binPath);
  } catch {
    return false;
  }
}

/**
 * Runtime diagnostic to inspect yt-dlp binary status and report version without downloading media.
 */
export async function checkYtDlpDiagnostic(customBinPath?: string): Promise<{
  ok: boolean;
  version?: string;
  path?: string;
  isStandalone: boolean;
  architecture: string;
  platform: string;
  error?: string;
}> {
  try {
    const binPath = getYtDlpExecutablePath(customBinPath);
    if (!binPath) {
      return {
        ok: false,
        isStandalone: false,
        architecture: process.arch,
        platform: process.platform,
        error: "yt-dlp executable was not found in any standard path (bin/yt-dlp or node_modules).",
      };
    }

    const isStandalone = isBinaryStandalone(binPath);
    const runner = youtubedl.create(binPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const versionRaw: any = await runner("", { version: true });
    const version =
      typeof versionRaw === "string"
        ? versionRaw.trim()
        : String(versionRaw ?? "").trim();

    return {
      ok: true,
      version,
      path: binPath,
      isStandalone,
      architecture: process.arch,
      platform: process.platform,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      isStandalone: false,
      architecture: process.arch,
      platform: process.platform,
      error: msg,
    };
  }
}

export interface YouTubeErrorInfo {
  message: string;
  status: number;
  canBookmark: boolean;
}

/**
 * Format YouTube extractor errors into user-friendly, actionable messages
 * with accurate HTTP status codes and bookmark capability indicators.
 */
export function formatYouTubeError(err: unknown): YouTubeErrorInfo {
  const rawMsg = err instanceof Error ? err.message : String(err);
  const lowerMsg = rawMsg.toLowerCase();

  // 1. YouTube Bot verification / challenge (422)
  if (
    lowerMsg.includes("sign in to confirm") ||
    lowerMsg.includes("bot verification")
  ) {
    return {
      message:
        "YouTube blocked this automated server request with a bot verification challenge (HTTP 422). To protect your access, please bookmark the track to open directly, or upload the audio file.",
      status: 422,
      canBookmark: true,
    };
  }

  // 2. Missing ffmpeg / ffprobe dependency (501)
  if (
    lowerMsg.includes("ffprobe and ffmpeg not found") ||
    lowerMsg.includes("ffmpeg not found")
  ) {
    return {
      message:
        "Audio conversion dependency (ffmpeg) is not installed in the server environment (HTTP 501). Raw audio streams can be bookmarked or direct audio files can be uploaded.",
      status: 501,
      canBookmark: true,
    };
  }

  // 3. Missing downloader executable (yt-dlp) or python dependency (501)
  if (
    lowerMsg.includes("enoent") ||
    lowerMsg.includes("spawn") ||
    lowerMsg.includes("extraction engine unavailable") ||
    lowerMsg.includes("downloader not found") ||
    (lowerMsg.includes("python") && lowerMsg.includes("no such file")) ||
    lowerMsg.includes("python3: not found")
  ) {
    return {
      message:
        "Audio extraction engine is not available in the current serverless runtime environment (HTTP 501). Please save as a YouTube bookmark or upload your audio file directly.",
      status: 501,
      canBookmark: true,
    };
  }

  // 4. Timeouts (504)
  if (
    lowerMsg.includes("timed out") ||
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("etimedout")
  ) {
    return {
      message:
        "Audio extraction timed out after 50 seconds (HTTP 504). The video file may be too large or the connection timed out. Please save as a YouTube bookmark or upload your audio file directly.",
      status: 504,
      canBookmark: true,
    };
  }

  // 5. HTTP 403 Forbidden / Access Denial / Cloud Datacenter Restriction (403)
  if (
    lowerMsg.includes("http error 403") ||
    lowerMsg.includes("403: forbidden") ||
    lowerMsg.includes("403 forbidden")
  ) {
    if (
      lowerMsg.includes("copyright") ||
      lowerMsg.includes("in your country") ||
      lowerMsg.includes("uploader has not made") ||
      lowerMsg.includes("geo restricted") ||
      lowerMsg.includes("licens") ||
      lowerMsg.includes("premium")
    ) {
      return {
        message:
          "YouTube access restricted (HTTP 403: Forbidden). This video has licensing or copyright restrictions preventing automated extraction. Please save as a YouTube bookmark to play the original track directly.",
        status: 403,
        canBookmark: true,
      };
    }

    return {
      message:
        "YouTube denied media stream access (HTTP 403: Forbidden). YouTube restricts direct audio extraction from cloud servers for this video. You can save this track as a YouTube bookmark to play it directly.",
      status: 403,
      canBookmark: true,
    };
  }

  // 6. Rate limits / 429
  if (
    lowerMsg.includes("http error 429") ||
    lowerMsg.includes("429: too many requests") ||
    lowerMsg.includes("too many requests")
  ) {
    return {
      message:
        "YouTube rate limit reached (HTTP 429: Too Many Requests). YouTube has temporarily throttled server requests. Please wait a few minutes or save as a YouTube bookmark.",
      status: 429,
      canBookmark: true,
    };
  }

  // 7. Video unavailable / private / deleted / 404 (404)
  if (
    lowerMsg.includes("private video") ||
    lowerMsg.includes("video unavailable") ||
    lowerMsg.includes("unavailable") ||
    lowerMsg.includes("does not exist") ||
    lowerMsg.includes("not found") ||
    lowerMsg.includes("404")
  ) {
    return {
      message: "This YouTube video is unavailable, private, or does not exist (HTTP 404).",
      status: 404,
      canBookmark: false,
    };
  }

  // 8. Fallback: Clean up raw message and do not truncate abruptly
  const lines = rawMsg.split("\n").map((l) => l.trim()).filter(Boolean);
  const cleanLine =
    lines.find(
      (l) =>
        !l.startsWith("Traceback") &&
        !l.startsWith("File ") &&
        !l.includes("During handling of the above exception")
    ) || rawMsg;

  const cleanMessage = cleanLine
    .replace(/^ERROR:\s*(\[youtube\]\s*)?/i, "")
    .trim();

  return {
    message: `YouTube error: ${cleanMessage || "Failed to process video"}. Please save as a YouTube bookmark to play directly.`,
    status: 422,
    canBookmark: true,
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

/**
 * Inspects a YouTube playlist without downloading any audio streams upfront.
 * Uses flat-playlist JSON dump for fast serverless execution.
 */
export async function inspectYouTubePlaylist(
  playlistUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customRunner?: (url: string, opts: any) => Promise<any>
): Promise<YouTubePlaylistInspection> {
  const cleanUrl = playlistUrl.trim();
  const playlistId = extractYouTubePlaylistId(cleanUrl);
  if (!playlistId) {
    throw new Error(
      "The provided URL does not contain a valid YouTube playlist ID (list=...)."
    );
  }

  const runner = customRunner || getYtDlpRunner();

  // Execute flat playlist inspection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rawData: any;
  try {
    rawData = await runner(cleanUrl, {
      dumpSingleJson: true,
      flatPlaylist: true,
      noWarnings: true,
      jsRuntimes: `node:${process.execPath}`,
    });
  } catch (err) {
    throw err;
  }

  if (!rawData) {
    throw new Error("Failed to retrieve playlist information from YouTube.");
  }

  const rawEntries = Array.isArray(rawData.entries) ? rawData.entries : [];
  const entries: YouTubePlaylistItem[] = [];

  let position = 0;
  for (const item of rawEntries) {
    if (!item) continue;
    const rawId = item.id || (typeof item.url === "string" ? extractYouTubeVideoId(item.url) : null);
    if (!rawId) continue;

    const rawTitle = typeof item.title === "string" ? item.title.trim() : "";
    const isUnavailable =
      rawTitle === "[Private video]" ||
      rawTitle === "[Deleted video]" ||
      item.is_unavailable === true;

    const rawThumb =
      Array.isArray(item.thumbnails) && item.thumbnails.length > 0
        ? item.thumbnails[item.thumbnails.length - 1]?.url
        : `https://i.ytimg.com/vi/${rawId}/hqdefault.jpg`;

    entries.push({
      id: rawId,
      title: rawTitle || (isUnavailable ? "Unavailable Video" : "YouTube Track"),
      artist:
        item.uploader ||
        item.channel ||
        rawData.uploader ||
        rawData.channel ||
        "YouTube",
      duration: typeof item.duration === "number" ? Math.round(item.duration) : undefined,
      thumbnail: rawThumb,
      position: position++,
      url: `https://www.youtube.com/watch?v=${rawId}`,
      isUnavailable,
    });
  }

  const firstThumb = entries.find((e) => e.thumbnail && !e.isUnavailable)?.thumbnail;
  const playlistThumb =
    (Array.isArray(rawData.thumbnails) && rawData.thumbnails[0]?.url) ||
    firstThumb ||
    undefined;

  return {
    valid: true,
    type: "playlist",
    id: playlistId,
    title: rawData.title || "YouTube Playlist",
    channel: rawData.uploader || rawData.channel || "YouTube",
    thumbnail: playlistThumb,
    itemCount: entries.length,
    entries,
  };
}

export { findExistingSongForYouTubeId, isSongInPlaylist } from "./link-utils.ts";

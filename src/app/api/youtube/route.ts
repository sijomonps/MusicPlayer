import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import youtubedl from "youtube-dl-exec";
import {
  isSupabaseStorageConfigured,
  getStorageUsage,
  uploadAudioBuffer,
  MAX_AUDIO_FILE_SIZE,
} from "@/lib/supabase/storage";
import { isYouTubeUrl } from "@/lib/link-utils";
import { checkRateLimit } from "@/lib/security";

export const maxDuration = 60;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

/**
 * Builds yt-dlp execution options with cookies and player client arguments to prevent bot detection:
 * 1. Checks for a cookies.txt file in project root or path specified in YOUTUBE_COOKIE_PATH.
 * 2. Alternatively loads cookies from Chrome, Firefox, Edge, or Safari where user is logged in.
 * 3. Enforces player_client fallback to Android & Web to bypass bot verification challenges.
 */
function getYouTubeDlOptions(extraFlags: Record<string, unknown> = {}): Record<string, unknown> {
  const options: Record<string, unknown> = {
    noWarnings: true,
    preferFreeFormats: true,
    // Force Android and Web client fallback to prevent YouTube bot challenges
    extractorArgs: "youtube:player_client=android,web",
    ...extraFlags,
  };

  // 1. Fallback to cookies.txt file in project root if it exists
  const rootCookiePath = path.resolve(process.cwd(), "cookies.txt");
  const envCookiePath = process.env.YOUTUBE_COOKIE_PATH?.trim();

  if (envCookiePath && fs.existsSync(envCookiePath)) {
    options.cookies = envCookiePath;
  } else if (fs.existsSync(rootCookiePath)) {
    options.cookies = rootCookiePath;
  } else {
    // 2. Pass cookies from local browser (Chrome, Firefox, Safari, Edge)
    const browser = process.env.YOUTUBE_COOKIES_BROWSER?.trim() || "chrome";
    options.cookiesFromBrowser = browser;
  }

  return options;
}

/**
 * Executes youtubedl with automatic cookie fallback:
 * If local browser cookie database is locked or not found, retries without browser cookies.
 */
async function runYouTubeDl(
  url: string,
  flags: Record<string, unknown> = {}
): Promise<unknown> {
  const options = getYouTubeDlOptions(flags);
  try {
    return await youtubedl(url, options);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // If reading browser cookies failed due to browser profile lock or missing browser,
    // retry once cleanly without cookiesFromBrowser
    if (
      options.cookiesFromBrowser &&
      (errorMsg.includes("cookies-from-browser") ||
        errorMsg.includes("cookie database") ||
        errorMsg.includes("Could not copy") ||
        errorMsg.includes("database is locked") ||
        errorMsg.includes("Browser not found") ||
        errorMsg.includes("could not find"))
    ) {
      console.warn(
        "Browser cookie extraction failed, retrying without browser cookies:",
        errorMsg
      );
      const fallbackOptions = { ...options };
      delete fallbackOptions.cookiesFromBrowser;
      return await youtubedl(url, fallbackOptions);
    }

    throw err;
  }
}

/**
 * Formats YouTube extractor errors into user-friendly messages.
 */
function formatYouTubeError(err: unknown): { message: string; status: number } {
  const rawMsg = err instanceof Error ? err.message : String(err);

  if (
    rawMsg.includes("Sign in to confirm you're not a bot") ||
    rawMsg.includes("Sign in to confirm") ||
    rawMsg.includes("bot verification")
  ) {
    return {
      message:
        "YouTube is requiring bot verification. Place a cookies.txt file in the project root or sign in via Chrome, or upload the audio file directly.",
      status: 422,
    };
  }

  if (rawMsg.includes("Private video") || rawMsg.includes("Video unavailable")) {
    return {
      message: "This YouTube video is unavailable or private.",
      status: 422,
    };
  }

  return {
    message: `YouTube error: ${rawMsg.split("\n")[0] || "Failed to process video"}`,
    status: 422,
  };
}

/**
 * GET /api/youtube?url=...
 * Inspects a YouTube video link and returns title, author, duration, and thumbnail preview.
 */
export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url")?.trim();
  if (!urlParam) {
    return NextResponse.json(
      { error: "Missing YouTube url parameter." },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  if (!isYouTubeUrl(urlParam)) {
    return NextResponse.json(
      {
        error:
          "Invalid YouTube URL. Please provide a standard youtube.com or youtu.be link.",
      },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const meta = (await runYouTubeDl(urlParam, {
      dumpSingleJson: true,
    })) as {
      title?: string;
      uploader?: string;
      channel?: string;
      duration?: number;
      thumbnail?: string;
    };

    return NextResponse.json(
      {
        valid: true,
        title: meta?.title || "YouTube Video",
        artist: meta?.uploader || meta?.channel || "YouTube",
        duration: meta?.duration || 0,
        thumbnail: meta?.thumbnail,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const { message, status } = formatYouTubeError(err);
    return NextResponse.json({ error: message }, { status, headers: NO_CACHE_HEADERS });
  }
}

/**
 * POST /api/youtube
 * Extracts audio from a YouTube video and uploads it directly to Supabase Storage.
 * Passcode-free.
 *
 * Request body (JSON):
 * - url: string (required) - YouTube video URL
 * - title?: string (optional) - Custom song title override
 * - artist?: string (optional) - Custom artist title override
 */
export async function POST(req: NextRequest) {
  // Rate limiting to prevent abuse
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "127.0.0.1";

  if (!checkRateLimit(clientIp, 30, 60 * 1000)) {
    return NextResponse.json(
      { error: "Too many extraction requests. Please wait a moment and try again." },
      { status: 429, headers: NO_CACHE_HEADERS }
    );
  }

  // 1. Verify Supabase Storage configuration
  if (!isSupabaseStorageConfigured) {
    return NextResponse.json(
      {
        error:
          "Supabase Storage is not configured. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your environment.",
      },
      { status: 503, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { url, title, artist } = body;

    // 2. Validate URL
    const trimmedUrl = typeof url === "string" ? url.trim() : "";
    if (!trimmedUrl || !isYouTubeUrl(trimmedUrl)) {
      return NextResponse.json(
        {
          error:
            "Invalid YouTube link. Please provide a valid youtube.com or youtu.be URL.",
        },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // 3. Retrieve video metadata to inspect duration and details before extraction
    let meta: {
      title?: string;
      uploader?: string;
      channel?: string;
      duration?: number;
      thumbnail?: string;
    } = {};

    try {
      meta = (await runYouTubeDl(trimmedUrl, {
        dumpSingleJson: true,
      })) as typeof meta;
    } catch (metaErr: unknown) {
      const { message, status } = formatYouTubeError(metaErr);
      return NextResponse.json({ error: message }, { status, headers: NO_CACHE_HEADERS });
    }

    // Guardrail: limit video duration to 30 minutes (1800 seconds) to avoid timeouts and 50 MB quota exceedance
    const durationSeconds =
      typeof meta?.duration === "number" ? meta.duration : 0;
    if (durationSeconds > 1800) {
      return NextResponse.json(
        {
          error:
            "This YouTube video is longer than 30 minutes. To stay within Supabase Free tier storage limits (50 MB) and avoid timeouts, please choose videos under 30 minutes.",
        },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    // 4. Check remaining Supabase storage quota
    try {
      const usage = await getStorageUsage();
      if (usage.bucketExists && usage.remainingBytes < 5 * 1024 * 1024) {
        return NextResponse.json(
          {
            error:
              "Your Supabase storage quota is almost full (< 5 MB remaining). Please delete some songs from your library before extracting new tracks.",
          },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }
    } catch {
      // Non-fatal if usage calculation fails, proceed with upload
    }

    // 5. Extract audio into temporary scratch folder
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-extract-"));

    try {
      await runYouTubeDl(trimmedUrl, {
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: "0",
        output: path.join(tempDir, "audio.%(ext)s"),
      });

      // Find the generated audio file in tempDir
      const files = fs.readdirSync(tempDir);
      const audioFileName = files.find(
        (f) =>
          f.endsWith(".mp3") ||
          f.endsWith(".m4a") ||
          f.endsWith(".opus") ||
          f.endsWith(".webm")
      );

      if (!audioFileName) {
        throw new Error(
          "Audio extraction finished but no audio output file was found."
        );
      }

      const filePath = path.join(tempDir, audioFileName);
      const stats = fs.statSync(filePath);

      // Verify file size does not exceed Supabase 50 MB free limit
      if (stats.size > MAX_AUDIO_FILE_SIZE) {
        return NextResponse.json(
          {
            error: `Extracted audio is ${(stats.size / 1024 / 1024).toFixed(
              1
            )} MB, which exceeds the Supabase Free plan limit of 50 MB per file.`,
          },
          { status: 413, headers: NO_CACHE_HEADERS }
        );
      }

      const fileBuffer = fs.readFileSync(filePath);

      // 6. Upload to Supabase Storage with cacheControl: "0"
      const trackId = `yt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const storagePath = `songs/${trackId}.mp3`;

      const uploadResult = await uploadAudioBuffer(
        storagePath,
        fileBuffer,
        "audio/mpeg"
      );

      const finalTitle =
        typeof title === "string" && title.trim()
          ? title.trim()
          : meta.title || "YouTube Audio";
      const finalArtist =
        typeof artist === "string" && artist.trim()
          ? artist.trim()
          : meta.uploader || meta.channel || "YouTube";
      const artwork = meta.thumbnail;

      return NextResponse.json(
        {
          success: true,
          song: {
            id: trackId,
            title: finalTitle,
            artist: finalArtist,
            album: "YouTube Audio",
            audio_url: uploadResult.publicUrl,
            storage_path: storagePath,
            artwork_url: artwork,
            duration: durationSeconds,
            source_type: "youtube_extracted",
            youtube_url: trimmedUrl,
            file_size: stats.size,
            created_at: new Date().toISOString(),
          },
        },
        { headers: NO_CACHE_HEADERS }
      );
    } finally {
      // 7. Always clean up temporary directory and files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn("Failed to clean up temp dir:", cleanupErr);
      }
    }
  } catch (err: unknown) {
    console.error("YouTube audio extraction error:", err);
    const { message, status } = formatYouTubeError(err);
    return NextResponse.json({ error: message }, { status, headers: NO_CACHE_HEADERS });
  }
}

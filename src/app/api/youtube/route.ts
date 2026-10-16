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
import { verifyPasscode } from "@/lib/passcode";
import { isYouTubeUrl } from "@/lib/link-utils";

export const maxDuration = 60;

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

function verifyRequestPasscode(
  req: NextRequest,
  bodySecret?: string
): { success: boolean; status: number; error?: string } {
  const clientIp = getClientIp(req);
  const headerSecret = req.headers.get("x-upload-secret")?.trim();
  const querySecret = new URL(req.url).searchParams.get("secret")?.trim();
  const provided = bodySecret?.trim() || headerSecret || querySecret;
  return verifyPasscode(clientIp, provided);
}

/**
 * GET /api/youtube?url=...
 * Inspects a YouTube video link and returns title, author, duration, and thumbnail preview.
 */
export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url")?.trim();
  if (!urlParam) {
    return NextResponse.json({ error: "Missing YouTube url parameter." }, { status: 400 });
  }

  if (!isYouTubeUrl(urlParam)) {
    return NextResponse.json(
      { error: "Invalid YouTube URL. Please provide a standard youtube.com or youtu.be link." },
      { status: 400 }
    );
  }

  try {
    const meta = (await youtubedl(urlParam, {
      dumpSingleJson: true,
      noWarnings: true,
      preferFreeFormats: true,
    })) as {
      title?: string;
      uploader?: string;
      channel?: string;
      duration?: number;
      thumbnail?: string;
    };

    return NextResponse.json({
      valid: true,
      title: meta.title || "YouTube Video",
      artist: meta.uploader || meta.channel || "YouTube",
      duration: meta.duration || 0,
      thumbnail: meta.thumbnail,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch video details.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}

/**
 * POST /api/youtube
 * Extracts audio from a YouTube video and uploads it directly to Supabase Storage.
 *
 * Request body (JSON):
 * - url: string (required) - YouTube video URL
 * - title?: string (optional) - Custom song title override
 * - artist?: string (optional) - Custom artist title override
 * - secret?: string (optional) - Upload security passcode
 */
export async function POST(req: NextRequest) {
  // 1. Verify Supabase Storage configuration
  if (!isSupabaseStorageConfigured) {
    return NextResponse.json(
      {
        error:
          "Supabase Storage is not configured. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your environment.",
      },
      { status: 503 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { url, title, artist, secret } = body;

    // 2. Strict passcode verification
    const auth = verifyRequestPasscode(req, secret);
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // 3. Validate URL
    const trimmedUrl = typeof url === "string" ? url.trim() : "";
    if (!trimmedUrl || !isYouTubeUrl(trimmedUrl)) {
      return NextResponse.json(
        {
          error:
            "Invalid YouTube link. Please provide a valid youtube.com or youtu.be URL.",
        },
        { status: 400 }
      );
    }

    // 4. Retrieve video metadata to inspect duration and details before extraction
    let meta: {
      title?: string;
      uploader?: string;
      channel?: string;
      duration?: number;
      thumbnail?: string;
    } = {};

    try {
      meta = (await youtubedl(trimmedUrl, {
        dumpSingleJson: true,
        noWarnings: true,
        preferFreeFormats: true,
      })) as typeof meta;
    } catch (metaErr: unknown) {
      const msg =
        metaErr instanceof Error ? metaErr.message : "Could not inspect YouTube video.";
      if (msg.includes("Sign in to confirm you're not a bot")) {
        return NextResponse.json(
          {
            error:
              "YouTube is requiring bot verification for this video. Please try another video or upload the audio file directly.",
          },
          { status: 422 }
        );
      }
      return NextResponse.json(
        { error: `Failed to fetch video information: ${msg}` },
        { status: 422 }
      );
    }

    // Guardrail: limit video duration to 30 minutes (1800 seconds) to avoid timeouts and 50 MB quota exceedance
    const durationSeconds = typeof meta.duration === "number" ? meta.duration : 0;
    if (durationSeconds > 1800) {
      return NextResponse.json(
        {
          error:
            "This YouTube video is longer than 30 minutes. To stay within Supabase Free tier storage limits (50 MB) and avoid timeouts, please choose videos under 30 minutes.",
        },
        { status: 400 }
      );
    }

    // 5. Check remaining Supabase storage quota
    try {
      const usage = await getStorageUsage();
      if (usage.bucketExists && usage.remainingBytes < 5 * 1024 * 1024) {
        return NextResponse.json(
          {
            error:
              "Your Supabase storage quota is almost full (< 5 MB remaining). Please delete some songs from your library before extracting new tracks.",
          },
          { status: 400 }
        );
      }
    } catch {
      // Non-fatal if usage calculation fails, proceed with upload
    }

    // 6. Extract audio into temporary scratch folder
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-extract-"));

    try {
      await youtubedl(trimmedUrl, {
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: "0",
        output: path.join(tempDir, "audio.%(ext)s"),
        noWarnings: true,
        preferFreeFormats: true,
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
        throw new Error("Audio extraction finished but no audio output file was found.");
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
          { status: 413 }
        );
      }

      const fileBuffer = fs.readFileSync(filePath);

      // 7. Upload to Supabase Storage
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

      return NextResponse.json({
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
      });
    } finally {
      // 8. Always clean up temporary directory and files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn("Failed to clean up temp dir:", cleanupErr);
      }
    }
  } catch (err: unknown) {
    console.error("YouTube audio extraction error:", err);
    const msg =
      err instanceof Error ? err.message : "Failed to extract audio from YouTube.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

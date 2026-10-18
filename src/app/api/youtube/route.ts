import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isSupabaseStorageConfigured,
  getSupabaseAdminClient,
  getStorageUsage,
  uploadAudioBuffer,
} from "@/lib/supabase/storage";
import {
  isYouTubeUrl,
  extractYouTubeVideoId,
  parseYouTubeUrl,
} from "@/lib/link-utils";
import { checkRateLimit } from "@/lib/security";

export const maxDuration = 60;

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

import {
  isYtDlpAvailable,
  getYtDlpRunner,
  ensureYtDlpBinaryReady,
  checkYtDlpDiagnostic,
  formatYouTubeError,
  fetchOEmbedMetadata,
  checkFileSizeLimit,
  rollbackUploadedAudio,
  inspectYouTubePlaylist,
} from "@/lib/youtube-service";

/**
 * GET /api/youtube?url=...&action=playlist|video|diagnostic
 * Inspects a YouTube video URL or playlist URL, or checks runtime diagnostics.
 * Fast, serverless-safe, and resilient.
 */
export async function GET(req: NextRequest) {
  const actionParam = req.nextUrl.searchParams.get("action")?.trim();

  // 1. Runtime diagnostic check: reports standalone binary version & path without downloading media
  if (
    actionParam === "diagnostic" ||
    actionParam === "health" ||
    actionParam === "version"
  ) {
    const diag = await checkYtDlpDiagnostic();
    return NextResponse.json(diag, {
      status: diag.ok ? 200 : 500,
      headers: NO_CACHE_HEADERS,
    });
  }

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

  const parsedYt = parseYouTubeUrl(urlParam);

  try {
    // 1. Playlist Inspection
    if (actionParam === "playlist" || (!actionParam && parsedYt.isPlaylistOnly)) {
      const playlistInfo = await inspectYouTubePlaylist(urlParam);
      return NextResponse.json(playlistInfo, { headers: NO_CACHE_HEADERS });
    }

    // 2. Video Inspection via oEmbed
    const meta = await fetchOEmbedMetadata(urlParam);

    return NextResponse.json(
      {
        valid: true,
        type: "video",
        id: parsedYt.videoId,
        title: meta.title,
        artist: meta.artist,
        duration: 0,
        thumbnail: meta.thumbnail,
        playlistId: parsedYt.playlistId,
        isComposite: parsedYt.isComposite,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const errorDetails = formatYouTubeError(err);
    return NextResponse.json(
      { error: errorDetails.message, canBookmark: errorDetails.canBookmark },
      { status: errorDetails.status, headers: NO_CACHE_HEADERS }
    );
  }
}

/**
 * POST /api/youtube
 * Processes authorized video audio extraction, uploads to Supabase Storage,
 * and creates the corresponding public.songs record on the server.
 *
 * Request body (JSON):
 * - url: string (required) - YouTube video URL
 * - title?: string (optional) - Custom song title override
 * - artist?: string (optional) - Custom artist title override
 */
export async function POST(req: NextRequest) {
  // 1. IP Rate Limiting to prevent denial-of-service abuse
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

  // 2. Verify Supabase Storage configuration
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

    // 3. Validate URL
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

    // 4. Retrieve video metadata via oEmbed
    let meta: { title: string; artist: string; thumbnail?: string };
    try {
      meta = await fetchOEmbedMetadata(trimmedUrl);
    } catch (metaErr: unknown) {
      const errorDetails = formatYouTubeError(metaErr);
      return NextResponse.json(
        { error: errorDetails.message, canBookmark: errorDetails.canBookmark },
        { status: errorDetails.status, headers: NO_CACHE_HEADERS }
      );
    }

    // 5. Verify runtime downloader availability and ensure binary is ready
    try {
      await ensureYtDlpBinaryReady();
    } catch {
      // Continue to check isYtDlpAvailable fallback
    }

    if (!isYtDlpAvailable()) {
      return NextResponse.json(
        {
          error:
            "Audio extraction engine is not available in the serverless deployment environment. You can bookmark this YouTube video to play it directly or upload an audio file.",
        },
        { status: 501, headers: NO_CACHE_HEADERS }
      );
    }

    // 6. Check remaining Supabase storage quota
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
      // Non-fatal if usage calculation fails, proceed
    }

    // 7. Extract audio into a temporary scratch directory
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "yt-extract-"));

    try {
      // Use best native audio stream to avoid ffmpeg transcoding dependencies where possible
      const runner = getYtDlpRunner();
      await runner(trimmedUrl, {
        format: "bestaudio[ext=m4a]/bestaudio/best",
        output: path.join(tempDir, "audio.%(ext)s"),
        noWarnings: true,
        noPlaylist: true,
        preferFreeFormats: true,
        jsRuntimes: `node:${process.execPath}`,
      });

      // Find the generated audio file
      const files = fs.readdirSync(tempDir);
      const audioFileName = files.find(
        (f) =>
          f.endsWith(".m4a") ||
          f.endsWith(".mp3") ||
          f.endsWith(".webm") ||
          f.endsWith(".opus") ||
          f.endsWith(".aac")
      );

      if (!audioFileName) {
        throw new Error(
          "Audio extraction finished but no supported audio stream file was found."
        );
      }

      const filePath = path.join(tempDir, audioFileName);
      const stats = fs.statSync(filePath);

      // Verify file size does not exceed Supabase 50 MB free limit
      const sizeCheck = checkFileSizeLimit(stats.size);
      if (!sizeCheck.ok) {
        return NextResponse.json(
          { error: sizeCheck.error },
          { status: sizeCheck.status, headers: NO_CACHE_HEADERS }
        );
      }

      const fileBuffer = fs.readFileSync(filePath);
      const mimeType = audioFileName.endsWith(".m4a")
        ? "audio/mp4"
        : audioFileName.endsWith(".webm")
        ? "audio/webm"
        : "audio/mpeg";

      // 8. Upload to Supabase Storage with zero cache header
      const trackId = crypto.randomUUID();
      const fileExt = path.extname(audioFileName) || ".m4a";
      const storagePath = `songs/${trackId}${fileExt}`;

      const uploadResult = await uploadAudioBuffer(
        storagePath,
        fileBuffer,
        mimeType
      );

      const finalTitle =
        typeof title === "string" && title.trim()
          ? title.trim()
          : meta.title || "YouTube Audio";
      const finalArtist =
        typeof artist === "string" && artist.trim()
          ? artist.trim()
          : meta.artist || "YouTube";
      const artwork = meta.thumbnail;
      const createdAt = new Date().toISOString();

      // 9. Persist public.songs record immediately on server with service role client
      const adminClient = getSupabaseAdminClient();
      if (!adminClient) {
        await rollbackUploadedAudio(storagePath);
        return NextResponse.json(
          {
            error:
              "Supabase admin service client could not be initialized. Please check SUPABASE_SERVICE_ROLE_KEY.",
          },
          { status: 500, headers: NO_CACHE_HEADERS }
        );
      }
      const videoId = extractYouTubeVideoId(trimmedUrl);
      const songRow: Record<string, unknown> = {
        id: trackId,
        title: finalTitle,
        artist: finalArtist,
        album: "YouTube Audio",
        duration: 0,
        audio_url: uploadResult.publicUrl,
        storage_path: storagePath,
        r2_key: storagePath,
        artwork_url: artwork || null,
        source_type: "youtube_extracted",
        youtube_url: trimmedUrl,
        youtube_video_id: videoId || null,
        created_at: createdAt,
      };

      let dbInsertSuccess = false;
      let dbErrorMsg = "";

      let insertRes = await adminClient.from("songs").insert(songRow);

      if (insertRes.error) {
        // If storage_path or youtube_video_id columns are missing, gracefully remove and retry
        let needsRetry = false;
        if (insertRes.error.message.includes("storage_path") && "storage_path" in songRow) {
          delete songRow.storage_path;
          needsRetry = true;
        }
        if (insertRes.error.message.includes("youtube_video_id") && "youtube_video_id" in songRow) {
          delete songRow.youtube_video_id;
          needsRetry = true;
        }

        if (needsRetry) {
          insertRes = await adminClient.from("songs").insert(songRow);
          if (insertRes.error) {
            if (insertRes.error.message.includes("youtube_video_id") && "youtube_video_id" in songRow) {
              delete songRow.youtube_video_id;
              insertRes = await adminClient.from("songs").insert(songRow);
            } else if (insertRes.error.message.includes("storage_path") && "storage_path" in songRow) {
              delete songRow.storage_path;
              insertRes = await adminClient.from("songs").insert(songRow);
            }
          }
        }

        if (insertRes.error) {
          dbErrorMsg = insertRes.error.message;
        } else {
          dbInsertSuccess = true;
        }
      } else {
        dbInsertSuccess = true;
      }

      // If database insertion failed, clean up uploaded storage object to prevent orphans
      if (!dbInsertSuccess) {
        console.error("Database song insertion failed after storage upload:", dbErrorMsg);
        await rollbackUploadedAudio(storagePath);

        return NextResponse.json(
          {
            error: `Failed to save track record to database: ${dbErrorMsg}. Storage file was cleaned up.`,
          },
          { status: 500, headers: NO_CACHE_HEADERS }
        );
      }

      // 10. Return confirmed persisted song
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
            duration: 0,
            source_type: "youtube_extracted",
            youtube_url: trimmedUrl,
            youtube_video_id: videoId || undefined,
            created_at: createdAt,
          },
        },
        { headers: NO_CACHE_HEADERS }
      );
    } finally {
      // 11. Always clean up temporary directory and files
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn("Failed to clean up temp dir:", cleanupErr);
      }
    }
  } catch (err: unknown) {
    const errorDetails = formatYouTubeError(err);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errObj = err as any;

    console.error("YouTube audio extraction diagnostics:", {
      status: errorDetails.status,
      error: errorDetails.message,
      canBookmark: errorDetails.canBookmark,
      exitCode: errObj?.exitCode,
      stderr: errObj?.stderr ? String(errObj.stderr).slice(0, 1000) : undefined,
      rawError: errObj?.message ? String(errObj.message).slice(0, 500) : String(err),
    });

    return NextResponse.json(
      {
        error: errorDetails.message,
        status: errorDetails.status,
        canBookmark: errorDetails.canBookmark,
      },
      { status: errorDetails.status, headers: NO_CACHE_HEADERS }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  isSupabaseStorageConfigured,
  getSupabaseAdminClient,
  getStorageUsage,
  createSignedAudioUploadUrl,
  getPublicAudioUrl,
  deleteAudioFile,
  MAX_AUDIO_FILE_SIZE,
  SUPABASE_STORAGE_BUCKET,
} from "@/lib/supabase/storage";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/x-flac",
  "audio/webm",
]);

import { checkRateLimit, isSafePath } from "@/lib/security";

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

/**
 * GET /api/upload
 * Returns current Supabase Storage usage and free tier statistics (1 GB quota).
 * Passcode-free, returns live stats with no-cache headers.
 */
export async function GET() {
  if (!isSupabaseStorageConfigured) {
    return NextResponse.json(
      {
        configured: false,
        error:
          "Supabase Storage is not configured. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your environment.",
      },
      { status: 503, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const summary = await getStorageUsage();
    return NextResponse.json(
      {
        configured: true,
        storage: summary,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    console.error("Storage summary error:", err);
    const msg =
      err instanceof Error ? err.message : "Failed to calculate storage usage.";
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

/**
 * POST /api/upload
 * Handles passcode-free direct upload URL creation and multipart upload fallback.
 */
export async function POST(req: NextRequest) {
  if (!isSupabaseStorageConfigured) {
    return NextResponse.json(
      {
        error:
          "Supabase Storage is not configured. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in your environment.",
      },
      { status: 503, headers: NO_CACHE_HEADERS }
    );
  }

  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: "Too many upload requests. Please wait a moment." },
      { status: 429, headers: NO_CACHE_HEADERS }
    );
  }

  const contentTypeHeader = req.headers.get("content-type") || "";

  // 1. JSON Request handling (Signed Upload URL / Complete)
  if (contentTypeHeader.includes("application/json")) {
    try {
      const body = await req.json().catch(() => ({}));
      const { action, filename, contentType, size, title, artist, path } = body;

      // Action: Complete upload (fetch updated usage and return verified song metadata)
      if (action === "complete") {
        if (!path || !isSafePath(path)) {
          return NextResponse.json(
            { error: "Invalid or missing file path for upload completion." },
            { status: 400, headers: NO_CACHE_HEADERS }
          );
        }

        const audioUrl = getPublicAudioUrl(path);
        const cleanTitle =
          title?.trim() ||
          path.split("-").slice(1).join("-").replace(/\.[^/.]+$/, "") ||
          "Untitled Track";

        const updatedSummary = await getStorageUsage();

        return NextResponse.json(
          {
            success: true,
            audioUrl,
            path,
            storage: updatedSummary,
            song: {
              id: crypto.randomUUID(),
              title: cleanTitle,
              artist: artist?.trim() || "Unknown Artist",
              audio_url: audioUrl,
              storage_path: path,
              source_type: "upload",
              created_at: new Date().toISOString(),
            },
          },
          { headers: NO_CACHE_HEADERS }
        );
      }

      // Default: Request signed upload URL
      if (!filename || typeof filename !== "string") {
        return NextResponse.json(
          { error: "Filename is required." },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }

      const requestedSize = typeof size === "number" ? size : 0;
      if (requestedSize <= 0) {
        return NextResponse.json(
          { error: "Valid file size is required." },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }

      // Supabase Free Plan enforces a 50 MB max file upload limit
      if (requestedSize > MAX_AUDIO_FILE_SIZE) {
        return NextResponse.json(
          {
            error: `File size exceeds Supabase Free plan limit of 50 MB (File is ${(
              requestedSize /
              1024 /
              1024
            ).toFixed(1)} MB).`,
          },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }

      const extension = filename.split(".").pop()?.toLowerCase();
      const isAllowedExt =
        extension &&
        ["mp3", "m4a", "aac", "ogg", "wav", "flac", "webm"].includes(extension);

      if (contentType && !ALLOWED_MIME_TYPES.has(contentType) && !isAllowedExt) {
        return NextResponse.json(
          {
            error: `Unsupported audio format (${
              contentType || extension
            }). Supported formats: MP3, M4A, AAC, OGG, WAV, FLAC, WEBM.`,
          },
          { status: 400, headers: NO_CACHE_HEADERS }
        );
      }

      const cleanFileName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const uniqueId = crypto.randomUUID();
      const storagePath = `${uniqueId}-${cleanFileName}`;
      const normalizedContentType =
        contentType || (extension === "m4a" ? "audio/mp4" : "audio/mpeg");

      const signedData = await createSignedAudioUploadUrl(storagePath);
      const songTitle = title?.trim() || filename.replace(/\.[^/.]+$/, "");

      return NextResponse.json(
        {
          success: true,
          uploadMode: "signed",
          signedUrl: signedData.signedUrl,
          token: signedData.token,
          path: storagePath,
          audioUrl: signedData.publicUrl,
          expectedContentType: normalizedContentType,
          song: {
            id: uniqueId,
            title: songTitle,
            artist: artist?.trim() || "Unknown Artist",
            audio_url: signedData.publicUrl,
            storage_path: storagePath,
            source_type: "upload",
            created_at: new Date().toISOString(),
          },
        },
        { headers: NO_CACHE_HEADERS }
      );
    } catch (error: unknown) {
      console.error("Signed URL creation error:", error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json(
        { error: "Failed to initialize upload: " + msg },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }
  }

  // 2. Multipart form data direct upload fallback
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "";
    const artist = (formData.get("artist") as string) || "Unknown Artist";

    if (!file) {
      return NextResponse.json(
        { error: "No audio file provided." },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    if (file.size > MAX_AUDIO_FILE_SIZE) {
      return NextResponse.json(
        {
          error: `File size exceeds Supabase Free plan limit of 50 MB (File is ${(
            file.size /
            1024 /
            1024
          ).toFixed(1)} MB).`,
        },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    const isAllowedExt =
      extension &&
      ["mp3", "m4a", "aac", "ogg", "wav", "flac", "webm"].includes(extension);

    if (!ALLOWED_MIME_TYPES.has(file.type) && !isAllowedExt) {
      return NextResponse.json(
        {
          error: `Unsupported audio format (${
            file.type || extension
          }). Supported formats: MP3, M4A, AAC, OGG, WAV, FLAC, WEBM.`,
        },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueId = crypto.randomUUID();
    const storagePath = `${uniqueId}-${cleanFileName}`;
    const contentType =
      file.type || (extension === "m4a" ? "audio/mp4" : "audio/mpeg");

    const client = getSupabaseAdminClient();
    if (!client) {
      return NextResponse.json(
        { error: "Supabase client is not available." },
        { status: 500, headers: NO_CACHE_HEADERS }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await client.storage
      .from(SUPABASE_STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: true,
        cacheControl: "0",
      });

    if (uploadError) {
      return NextResponse.json(
        { error: `Supabase upload error: ${uploadError.message}` },
        { status: 400, headers: NO_CACHE_HEADERS }
      );
    }

    const audioUrl = getPublicAudioUrl(storagePath);
    const updatedSummary = await getStorageUsage();
    const songTitle = title.trim() || file.name.replace(/\.[^/.]+$/, "");

    return NextResponse.json(
      {
        success: true,
        uploadMode: "direct",
        audioUrl,
        path: storagePath,
        storage: updatedSummary,
        song: {
          id: uniqueId,
          title: songTitle,
          artist: artist.trim() || "Unknown Artist",
          audio_url: audioUrl,
          storage_path: storagePath,
          source_type: "upload",
          created_at: new Date().toISOString(),
        },
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (error: unknown) {
    console.error("Direct upload error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Upload failed: " + msg },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

/**
 * DELETE /api/upload?path=...
 * Deletes an audio object from Supabase Storage and returns updated storage statistics.
 * Passcode-free with path traversal protection.
 */
export async function DELETE(req: NextRequest) {
  if (!isSupabaseStorageConfigured) {
    return NextResponse.json(
      { error: "Supabase Storage is not configured." },
      { status: 503, headers: NO_CACHE_HEADERS }
    );
  }

  const clientIp = getClientIp(req);
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json(
      { error: "Too many delete requests. Please wait a moment." },
      { status: 429, headers: NO_CACHE_HEADERS }
    );
  }

  const { searchParams } = new URL(req.url);
  const rawPath = searchParams.get("path") || searchParams.get("key");

  if (!rawPath || !isSafePath(rawPath)) {
    return NextResponse.json(
      { error: "Invalid or missing audio path parameter." },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }

  try {
    const cleanPath = rawPath.replace(/^\/+/, "");
    await deleteAudioFile(cleanPath);
    const updatedSummary = await getStorageUsage();

    return NextResponse.json(
      {
        success: true,
        deletedPath: cleanPath,
        storage: updatedSummary,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete object.";
    return NextResponse.json(
      { error: msg },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}

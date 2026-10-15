import { NextRequest, NextResponse } from "next/server";
import { r2Client, R2_BUCKET_NAME, R2_PUBLIC_URL, isR2Configured } from "@/lib/r2";
import { PutObjectCommand } from "@aws-sdk/client-s3";

// Maximum 50 MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

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
]);

export async function POST(req: NextRequest) {
  if (!isR2Configured || !r2Client) {
    return NextResponse.json(
      {
        error:
          "Cloudflare R2 is not configured. Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in your environment.",
      },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();

    // Check optional upload passcode to prevent public abuse
    const configuredSecret = process.env.UPLOAD_SECRET?.trim();
    if (configuredSecret) {
      const headerSecret = req.headers.get("x-upload-secret")?.trim();
      const formSecret = (formData.get("secret") as string)?.trim();
      if (headerSecret !== configuredSecret && formSecret !== configuredSecret) {
        return NextResponse.json(
          { error: "Unauthorized: Incorrect or missing upload passcode." },
          { status: 401 }
        );
      }
    }

    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || "";
    const artist = (formData.get("artist") as string) || "Unknown Artist";

    if (!file) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds the 50 MB limit (File is ${(file.size / 1024 / 1024).toFixed(1)} MB)` },
        { status: 400 }
      );
    }

    // Validate MIME type or file extension
    const extension = file.name.split(".").pop()?.toLowerCase();
    const isAllowedExt = extension && ["mp3", "m4a", "aac", "ogg", "wav", "flac"].includes(extension);

    if (!ALLOWED_MIME_TYPES.has(file.type) && !isAllowedExt) {
      return NextResponse.json(
        {
          error: `Unsupported audio format (${file.type || extension}). Supported formats: MP3, M4A, AAC, OGG, WAV, FLAC.`,
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueId = crypto.randomUUID();
    const r2Key = `songs/${uniqueId}-${cleanFileName}`;

    const contentType = file.type || (extension === "m4a" ? "audio/mp4" : "audio/mpeg");

    // Upload to Cloudflare R2
    const putCommand = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: r2Key,
      Body: buffer,
      ContentType: contentType,
      ContentLength: buffer.length,
    });

    await r2Client.send(putCommand);

    // Audio stream URL: if R2_PUBLIC_URL is configured, use public CDN URL, otherwise use range-supporting /api/stream proxy
    const audioUrl = R2_PUBLIC_URL
      ? `${R2_PUBLIC_URL.replace(/\/$/, "")}/${r2Key}`
      : `/api/stream?key=${encodeURIComponent(r2Key)}`;

    // Clean display title
    const songTitle = title.trim() || file.name.replace(/\.[^/.]+$/, "");

    return NextResponse.json({
      success: true,
      song: {
        id: uniqueId,
        title: songTitle,
        artist: artist.trim() || "Unknown Artist",
        audio_url: audioUrl,
        r2_key: r2Key,
        source_type: "upload",
        created_at: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    console.error("Upload error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Upload failed: " + msg },
      { status: 500 }
    );
  }
}

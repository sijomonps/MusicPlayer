import { NextRequest, NextResponse } from "next/server";
import { r2Client, R2_BUCKET_NAME, isR2Configured } from "@/lib/r2";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");

  if (!key) {
    return NextResponse.json({ error: "Missing audio key parameter" }, { status: 400 });
  }

  if (!isR2Configured || !r2Client) {
    return NextResponse.json(
      { error: "Cloudflare R2 is not configured on this server." },
      { status: 503 }
    );
  }

  try {
    // 1. Get object metadata (size & content type)
    const headCommand = new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });
    const head = await r2Client.send(headCommand);

    const contentLength = head.ContentLength || 0;
    const contentType = head.ContentType || "audio/mpeg";

    // 2. Parse HTTP Range header (crucial for iOS Safari seeking and playback)
    const rangeHeader = req.headers.get("range");

    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : contentLength - 1;

      // Validate range
      if (start >= contentLength || end >= contentLength || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${contentLength}`,
          },
        });
      }

      const chunkLength = end - start + 1;

      // Request byte range from R2
      const getCommand = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Range: `bytes=${start}-${end}`,
      });
      const response = await r2Client.send(getCommand);

      // Convert S3 stream to Web ReadableStream
      const stream = response.Body as unknown as ReadableStream;

      return new NextResponse(stream as BodyInit, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${contentLength}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkLength.toString(),
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // Fallback: full stream if no Range header requested
    const getCommand = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });
    const response = await r2Client.send(getCommand);
    const stream = response.Body as unknown as ReadableStream;

    return new NextResponse(stream as BodyInit, {
      status: 200,
      headers: {
        "Content-Length": contentLength.toString(),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: unknown) {
    console.error("Error streaming audio from R2:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to stream audio file: " + msg },
      { status: 500 }
    );
  }
}

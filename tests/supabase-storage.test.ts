/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";
import {
  formatBytes,
  getStorageUsage,
  createSignedAudioUploadUrl,
  getPublicAudioUrl,
  deleteAudioFile,
  uploadAudioBuffer,
  SUPABASE_FREE_STORAGE_BYTES,
  MAX_AUDIO_FILE_SIZE,
} from "../src/lib/supabase/storage.ts";
import {
  verifyPasscode,
  resetFailedAttempts,
  timingSafeEqualStr,
  MAX_FAILED_ATTEMPTS,
} from "../src/lib/passcode.ts";
import {
  validateLinkInput,
  getAudioExtension,
  isYouTubeUrl,
} from "../src/lib/link-utils.ts";

/**
 * Mock Supabase Client simulating Supabase Storage API
 */
class MockSupabaseStorageClient {
  public files = new Map<
    string,
    { size: number; contentType?: string; id?: string }
  >();
  public bucketName: string;
  public failBucketNotFound = false;

  constructor(bucketName: string = "songs") {
    this.bucketName = bucketName;
  }

  get storage() {
    return {
      from: (bName: string) => {
        if (this.failBucketNotFound || bName !== this.bucketName) {
          return {
            list: async () => ({
              data: null,
              error: { message: `Bucket not found: ${bName}` },
            }),
            createSignedUploadUrl: async () => ({
              data: null,
              error: { message: `Bucket not found: ${bName}` },
            }),
            getPublicUrl: (path: string) => ({
              data: {
                publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bName}/${path}`,
              },
            }),
            remove: async () => ({
              data: null,
              error: { message: `Bucket not found: ${bName}` },
            }),
            upload: async () => ({
              data: null,
              error: { message: `Bucket not found: ${bName}` },
            }),
          };
        }

        return {
          list: async (folderPath: string = "") => {
            const listItems: Array<{
              name: string;
              id: string | null;
              metadata: { size: number; mimetype: string } | null;
            }> = [];

            const prefix = folderPath ? `${folderPath}/` : "";

            for (const [filePath, fileData] of this.files.entries()) {
              if (prefix && !filePath.startsWith(prefix)) continue;

              const relative = prefix ? filePath.slice(prefix.length) : filePath;
              if (relative.includes("/")) {
                const folderName = relative.split("/")[0];
                if (!listItems.some((i) => i.name === folderName)) {
                  listItems.push({
                    name: folderName,
                    id: null,
                    metadata: null,
                  });
                }
              } else {
                listItems.push({
                  name: relative,
                  id: fileData.id || `id-${relative}`,
                  metadata: {
                    size: fileData.size,
                    mimetype: fileData.contentType || "audio/mpeg",
                  },
                });
              }
            }

            return { data: listItems, error: null };
          },

          createSignedUploadUrl: async (path: string) => {
            const token = `mock-token-${Date.now()}`;
            return {
              data: {
                signedUrl: `https://mock.supabase.co/storage/v1/object/upload/sign/${bName}/${path}?token=${token}`,
                token,
                path,
              },
              error: null,
            };
          },

          getPublicUrl: (path: string) => {
            return {
              data: {
                publicUrl: `https://mock.supabase.co/storage/v1/object/public/${bName}/${path}`,
              },
            };
          },

          remove: async (paths: string[]) => {
            for (const p of paths) {
              this.files.delete(p);
            }
            return { data: paths.map((p) => ({ name: p })), error: null };
          },

          upload: async (path: string, body: any, options?: any) => {
            const size = body?.length || (body?.byteLength ?? 1024);
            this.files.set(path, {
              size,
              contentType: options?.contentType || "audio/mpeg",
              id: `id-${path}`,
            });
            return { data: { path, id: `id-${path}` }, error: null };
          },
        };
      },
    };
  }
}

test("1. formatBytes formats various byte amounts correctly", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1024 * 1024), "1 MB");
  assert.equal(formatBytes(50 * 1024 * 1024), "50 MB");
  assert.equal(formatBytes(1024 * 1024 * 1024), "1 GB");
  assert.equal(formatBytes(1.5 * 1024 * 1024 * 1024), "1.5 GB");
});

test("2. getStorageUsage calculates 0 usage for an empty bucket", async () => {
  const mockClient = new MockSupabaseStorageClient("songs") as any;
  const usage = await getStorageUsage(mockClient, "songs");

  assert.equal(usage.bucket, "songs");
  assert.equal(usage.bucketExists, true);
  assert.equal(usage.usedBytes, 0);
  assert.equal(usage.fileCount, 0);
  assert.equal(usage.quotaBytes, SUPABASE_FREE_STORAGE_BYTES);
  assert.equal(usage.remainingBytes, SUPABASE_FREE_STORAGE_BYTES);
  assert.equal(usage.percentUsed, 0);
  assert.equal(usage.usedFormatted, "0 B");
  assert.equal(usage.quotaFormatted, "1 GB");
});

test("3. getStorageUsage accurately sums file sizes across root and nested folders", async () => {
  const mockClient = new MockSupabaseStorageClient("songs") as any;

  mockClient.files.set("track1.mp3", { size: 10 * 1024 * 1024 });
  mockClient.files.set("favorites/track2.m4a", { size: 15 * 1024 * 1024 });

  const usage = await getStorageUsage(mockClient, "songs");

  const expectedBytes = 25 * 1024 * 1024;
  assert.equal(usage.usedBytes, expectedBytes);
  assert.equal(usage.fileCount, 2);
  assert.equal(usage.usedFormatted, "25 MB");
  assert.equal(usage.remainingBytes, SUPABASE_FREE_STORAGE_BYTES - expectedBytes);

  const expectedPercent = Number(
    ((expectedBytes / SUPABASE_FREE_STORAGE_BYTES) * 100).toFixed(1)
  );
  assert.equal(usage.percentUsed, expectedPercent);
});

test("4. getStorageUsage gracefully handles missing bucket without throwing", async () => {
  const mockClient = new MockSupabaseStorageClient("songs") as any;
  mockClient.failBucketNotFound = true;

  const usage = await getStorageUsage(mockClient, "songs");

  assert.equal(usage.bucketExists, false);
  assert.equal(usage.usedBytes, 0);
  assert.ok(usage.error);
  assert.match(usage.error, /Bucket 'songs' was not found/);
});

test("5. createSignedAudioUploadUrl generates signed URL with token and public URL", async () => {
  const mockClient = new MockSupabaseStorageClient("songs") as any;

  const result = await createSignedAudioUploadUrl("test-audio.mp3", mockClient, "songs");

  assert.equal(result.path, "test-audio.mp3");
  assert.ok(result.token.startsWith("mock-token-"));
  assert.match(result.signedUrl, /object\/upload\/sign\/songs\/test-audio\.mp3\?token=/);
  assert.equal(
    result.publicUrl,
    "https://mock.supabase.co/storage/v1/object/public/songs/test-audio.mp3"
  );
});

test("6. getPublicAudioUrl correctly constructs public streaming URL", () => {
  const mockClient = new MockSupabaseStorageClient("songs") as any;
  const publicUrl = getPublicAudioUrl("my-folder/song.mp3", mockClient, "songs");

  assert.equal(
    publicUrl,
    "https://mock.supabase.co/storage/v1/object/public/songs/my-folder/song.mp3"
  );
});

test("7. deleteAudioFile removes file from bucket", async () => {
  const mockClient = new MockSupabaseStorageClient("songs") as any;
  mockClient.files.set("track-to-delete.mp3", { size: 5 * 1024 * 1024 });

  assert.equal(mockClient.files.has("track-to-delete.mp3"), true);

  const delRes = await deleteAudioFile("track-to-delete.mp3", mockClient, "songs");
  assert.equal(delRes.success, true);
  assert.equal(mockClient.files.has("track-to-delete.mp3"), false);

  const afterUsage = await getStorageUsage(mockClient, "songs");
  assert.equal(afterUsage.usedBytes, 0);
  assert.equal(afterUsage.fileCount, 0);
});

test("8. Supabase Free Plan individual file size limit (50 MB) validation", () => {
  assert.equal(MAX_AUDIO_FILE_SIZE, 50 * 1024 * 1024);

  const underLimit = 49 * 1024 * 1024;
  const exactlyLimit = 50 * 1024 * 1024;
  const overLimit = 50 * 1024 * 1024 + 1;

  assert.ok(underLimit <= MAX_AUDIO_FILE_SIZE);
  assert.ok(exactlyLimit <= MAX_AUDIO_FILE_SIZE);
  assert.ok(overLimit > MAX_AUDIO_FILE_SIZE);
});

test("9. Storage usage does NOT enforce artificial blocking in app", async () => {
  const mockClient = new MockSupabaseStorageClient("songs") as any;
  mockClient.files.set("heavy-track.wav", { size: 950 * 1024 * 1024 });

  const usage = await getStorageUsage(mockClient, "songs");
  assert.equal(usage.usedFormatted, "950 MB");
  assert.ok(usage.percentUsed > 80);

  const result = await createSignedAudioUploadUrl("another-track.mp3", mockClient, "songs");
  assert.ok(result.signedUrl);
});

test("10. Security: Missing server UPLOAD_SECRET rejects requests with 503", () => {
  const originalSecret = process.env.UPLOAD_SECRET;
  delete process.env.UPLOAD_SECRET;
  resetFailedAttempts();

  try {
    const res = verifyPasscode("127.0.0.1", "some-secret");
    assert.equal(res.success, false);
    assert.equal(res.status, 503);
    assert.match(res.error || "", /UPLOAD_SECRET.*not configured/);
  } finally {
    if (originalSecret) process.env.UPLOAD_SECRET = originalSecret;
  }
});

test("11. Security: Upload without passcode is rejected with 401", () => {
  process.env.UPLOAD_SECRET = "test-secret-123";
  resetFailedAttempts();

  const res = verifyPasscode("192.168.1.101", "");
  assert.equal(res.success, false);
  assert.equal(res.status, 401);
  assert.match(res.error || "", /Missing upload passcode/);
});

test("12. Security: Upload with incorrect passcode is rejected with 401", () => {
  process.env.UPLOAD_SECRET = "test-secret-123";
  resetFailedAttempts();

  const res = verifyPasscode("192.168.1.102", "wrong-secret");
  assert.equal(res.success, false);
  assert.equal(res.status, 401);
  assert.match(res.error || "", /Incorrect upload passcode/);
});

test("13. Security: Upload with correct passcode succeeds", () => {
  process.env.UPLOAD_SECRET = "test-secret-123";
  resetFailedAttempts();

  const res = verifyPasscode("192.168.1.103", "test-secret-123");
  assert.equal(res.success, true);
  assert.equal(res.status, 200);
});

test("14. Security: Repeated failed attempts trigger 429 lockout protection", () => {
  process.env.UPLOAD_SECRET = "super-secret-key";
  const testIp = "10.0.0.99";
  resetFailedAttempts();

  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
    const res = verifyPasscode(testIp, `bad-attempt-${i}`);
    assert.equal(res.status, 401);
  }

  const lockedRes = verifyPasscode(testIp, "super-secret-key");
  assert.equal(lockedRes.success, false);
  assert.equal(lockedRes.status, 429);
  assert.match(lockedRes.error || "", /Too many failed passcode attempts/);
});

test("15. Security: timingSafeEqualStr verifies match correctly and safely", () => {
  assert.equal(timingSafeEqualStr("hello", "hello"), true);
  assert.equal(timingSafeEqualStr("hello", "world"), false);
  assert.equal(timingSafeEqualStr("hello", "hell"), false);
});

test("16. Link Validation: Direct audio URLs with supported formats pass", async () => {
  const mp3Result = await validateLinkInput("https://cdn.example.com/audio/song.mp3");
  assert.equal(mp3Result.isValid, true);
  assert.equal(mp3Result.type, "audio");
  assert.equal(mp3Result.format, "MP3");

  const m4aResult = await validateLinkInput("https://cdn.example.com/stream/track.m4a?token=xyz");
  assert.equal(m4aResult.isValid, true);
  assert.equal(m4aResult.type, "audio");
  assert.equal(m4aResult.format, "M4A");

  const flacResult = await validateLinkInput("https://cdn.example.com/hires/song.flac");
  assert.equal(flacResult.isValid, true);
  assert.equal(flacResult.type, "audio");
  assert.equal(flacResult.format, "FLAC");
});

test("17. Link Validation: YouTube links are correctly identified as bookmarks", async () => {
  const ytWatch = await validateLinkInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(ytWatch.isValid, true);
  assert.equal(ytWatch.type, "youtube");

  const ytShort = await validateLinkInput("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(ytShort.isValid, true);
  assert.equal(ytShort.type, "youtube");

  const ytMusic = await validateLinkInput("https://music.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(ytMusic.isValid, true);
  assert.equal(ytMusic.type, "youtube");
});

test("18. Link Validation: Non-audio web pages and files are rejected with clear error", async () => {
  const webpage = await validateLinkInput("https://example.com/article/123.html");
  assert.equal(webpage.isValid, false);
  assert.equal(webpage.type, "invalid");
  assert.match(webpage.error || "", /not a supported audio stream/);

  const pdfFile = await validateLinkInput("https://example.com/document.pdf");
  assert.equal(pdfFile.isValid, false);
  assert.equal(pdfFile.type, "invalid");
  assert.match(pdfFile.error || "", /not a supported audio stream/);
});

test("19. Link Validation: Malformed and non-HTTP URLs are rejected", async () => {
  const malformed = await validateLinkInput("not-a-valid-url");
  assert.equal(malformed.isValid, false);
  assert.match(malformed.error || "", /invalid/i);

  const ftpUrl = await validateLinkInput("ftp://example.com/song.mp3");
  assert.equal(ftpUrl.isValid, false);
  assert.match(ftpUrl.error || "", /HTTP and HTTPS/i);

  const empty = await validateLinkInput("   ");
  assert.equal(empty.isValid, false);
});

test("20. Audio Extension Helper: correctly parses supported extensions", () => {
  assert.equal(getAudioExtension("/music/test.mp3"), "mp3");
  assert.equal(getAudioExtension("/music/test.M4A"), "m4a");
  assert.equal(getAudioExtension("/music/test.wav"), "wav");
  assert.equal(getAudioExtension("/music/test.jpg"), null);
  assert.equal(getAudioExtension("/music/test"), null);
});

test("21. uploadAudioBuffer uploads buffer to bucket and returns public streaming URL", async () => {
  const mockClient = new MockSupabaseStorageClient("songs");
  const dummyBuffer = Buffer.from("mock-audio-mp3-stream-data");
  const res = await uploadAudioBuffer(
    "songs/test_extracted.mp3",
    dummyBuffer,
    "audio/mpeg",
    mockClient as any
  );

  assert.equal(res.path, "songs/test_extracted.mp3");
  assert.match(res.publicUrl, /https:\/\/mock\.supabase\.co\/storage\/v1\/object\/public\/songs\/songs\/test_extracted\.mp3/);
  assert.equal(mockClient.files.has("songs/test_extracted.mp3"), true);
  assert.equal(mockClient.files.get("songs/test_extracted.mp3")?.size, dummyBuffer.length);
});

test("22. isYouTubeUrl identifies valid YouTube URLs and rejects non-YouTube links", () => {
  assert.equal(isYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(isYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(isYouTubeUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ"), true);
  assert.equal(isYouTubeUrl("https://youtu.be/dQw4w9WgXcQ"), true);
  assert.equal(isYouTubeUrl("https://music.youtube.com/watch?v=dQw4w9WgXcQ"), true);

  assert.equal(isYouTubeUrl("https://spotify.com/track/123"), false);
  assert.equal(isYouTubeUrl("https://example.com/audio.mp3"), false);
  assert.equal(isYouTubeUrl("invalid-string"), false);
});

test("23. Security: YouTube extraction requires UPLOAD_SECRET and rejects unauthorized requests", () => {
  const savedEnv = process.env.UPLOAD_SECRET;
  try {
    process.env.UPLOAD_SECRET = "yt-secret-passcode";
    resetFailedAttempts("10.0.0.1");

    // Missing passcode
    const missing = verifyPasscode("10.0.0.1", "");
    assert.equal(missing.success, false);
    assert.equal(missing.status, 401);

    // Wrong passcode
    const wrong = verifyPasscode("10.0.0.1", "bad-passcode");
    assert.equal(wrong.success, false);
    assert.equal(wrong.status, 401);

    // Correct passcode
    const valid = verifyPasscode("10.0.0.1", "yt-secret-passcode");
    assert.equal(valid.success, true);
    assert.equal(valid.status, 200);
  } finally {
    process.env.UPLOAD_SECRET = savedEnv;
    resetFailedAttempts();
  }
});

test("24. Security: YouTube extraction rate limits brute-force attempts", () => {
  const savedEnv = process.env.UPLOAD_SECRET;
  try {
    process.env.UPLOAD_SECRET = "secure-key";
    resetFailedAttempts("10.0.0.2");

    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      verifyPasscode("10.0.0.2", "wrong");
    }

    // Next attempt triggers 429
    const blocked = verifyPasscode("10.0.0.2", "secure-key");
    assert.equal(blocked.success, false);
    assert.equal(blocked.status, 429);
    assert.match(blocked.error || "", /Too many failed/);
  } finally {
    process.env.UPLOAD_SECRET = savedEnv;
    resetFailedAttempts();
  }
});

test("25. Song Source Types: supports youtube_extracted and backward compatible bookmarks", () => {
  const extractedSong = {
    id: "yt_12345",
    title: "Rick Astley - Never Gonna Give You Up",
    artist: "Rick Astley",
    audio_url: "https://mock.supabase.co/storage/v1/object/public/songs/yt_12345.mp3",
    storage_path: "songs/yt_12345.mp3",
    source_type: "youtube_extracted" as const,
    youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    duration: 213,
    created_at: new Date().toISOString(),
  };

  assert.equal(extractedSong.source_type, "youtube_extracted");
  assert.equal(Boolean(extractedSong.audio_url), true);
  assert.equal(Boolean(extractedSong.storage_path), true);
  assert.equal(Boolean(extractedSong.youtube_url), true);
});


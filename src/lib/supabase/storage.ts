import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Free Plan Limits:
 * - 1 GB total storage quota across buckets
 * - 50 MB max file size per individual upload
 * - 5 GB monthly egress bandwidth
 * - 0 overage fees on Free plan (platform service restrictions apply if exceeded)
 */
export const SUPABASE_FREE_STORAGE_BYTES = 1 * 1024 * 1024 * 1024; // 1 GB (1,073,741,824 bytes)
export const MAX_AUDIO_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const SUPABASE_STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET?.trim() || "songs";

const supabaseUrl = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ""
).trim();

// On the server, require SUPABASE_SERVICE_ROLE_KEY for administrative storage operations
// (generating signed upload URLs, calculating bucket size, and deleting tracks).
// Never exposed to the browser or client bundles.
const supabaseServiceRoleKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();

const isPlaceholder = (val?: string) =>
  !val ||
  val.includes("your-") ||
  val.startsWith("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...") ||
  val === "sb_publishable_key_here";

export const isSupabaseStorageConfigured = Boolean(
  supabaseUrl &&
  !isPlaceholder(supabaseUrl) &&
  supabaseUrl.startsWith("http") &&
  supabaseServiceRoleKey &&
  !isPlaceholder(supabaseServiceRoleKey)
);

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!isSupabaseStorageConfigured) return null;
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export interface StorageUsageSummary {
  bucket: string;
  bucketExists: boolean;
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  percentUsed: number;
  usedFormatted: string;
  quotaFormatted: string;
  remainingFormatted: string;
  fileCount: number;
  error?: string;
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

/**
 * Calculates current actual Supabase Storage usage by querying the storage bucket.
 * Does not enforce an artificial limit; provides live statistics for the UI progress bar.
 */
export async function getStorageUsage(
  clientOverride?: SupabaseClient,
  bucketName: string = SUPABASE_STORAGE_BUCKET
): Promise<StorageUsageSummary> {
  const client = clientOverride || getSupabaseAdminClient();
  const quotaBytes = SUPABASE_FREE_STORAGE_BYTES;

  if (!client) {
    return {
      bucket: bucketName,
      bucketExists: false,
      usedBytes: 0,
      quotaBytes,
      remainingBytes: quotaBytes,
      percentUsed: 0,
      usedFormatted: "0 B",
      quotaFormatted: formatBytes(quotaBytes),
      remainingFormatted: formatBytes(quotaBytes),
      fileCount: 0,
      error:
        "SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local. Add your service_role secret key from Supabase Dashboard > Project Settings > API to enable storage management.",
    };
  }

  try {
    let totalSize = 0;
    let fileCount = 0;

    // Helper to recursively list files in bucket
    async function listFolder(folderPath: string = ""): Promise<void> {
      const { data, error } = await client!.storage
        .from(bucketName)
        .list(folderPath, {
          limit: 1000,
          sortBy: { column: "name", order: "asc" },
        });

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) return;

      for (const item of data) {
        // If it's a folder (id is null or item has no metadata.size and contains children)
        if (item.id === null && !item.metadata) {
          const subFolder = folderPath ? `${folderPath}/${item.name}` : item.name;
          await listFolder(subFolder);
        } else {
          fileCount += 1;
          const size = (item.metadata as { size?: number })?.size;
          if (typeof size === "number" && Number.isFinite(size)) {
            totalSize += size;
          }
        }
      }
    }

    await listFolder("");

    const remainingBytes = Math.max(0, quotaBytes - totalSize);
    const percentUsed = Number(
      Math.min(100, Math.max(0, (totalSize / quotaBytes) * 100)).toFixed(1)
    );

    return {
      bucket: bucketName,
      bucketExists: true,
      usedBytes: totalSize,
      quotaBytes,
      remainingBytes,
      percentUsed,
      usedFormatted: formatBytes(totalSize),
      quotaFormatted: formatBytes(quotaBytes),
      remainingFormatted: formatBytes(remainingBytes),
      fileCount,
    };
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error
        ? err.message
        : (err as { message?: string })?.message ||
          "Failed to list Supabase storage.";
    const isBucketNotFound =
      errorMsg.toLowerCase().includes("not found") ||
      errorMsg.toLowerCase().includes("bucket");

    return {
      bucket: bucketName,
      bucketExists: !isBucketNotFound,
      usedBytes: 0,
      quotaBytes,
      remainingBytes: quotaBytes,
      percentUsed: 0,
      usedFormatted: "0 B",
      quotaFormatted: formatBytes(quotaBytes),
      remainingFormatted: formatBytes(quotaBytes),
      fileCount: 0,
      error: isBucketNotFound
        ? `Bucket '${bucketName}' was not found. Please create a public bucket named '${bucketName}' in your Supabase dashboard.`
        : errorMsg,
    };
  }
}

/**
 * Creates a signed upload URL allowing direct, client-to-Supabase upload.
 * Avoids passing large audio files (>4.5 MB) through Vercel serverless functions.
 */
export async function createSignedAudioUploadUrl(
  filePath: string,
  clientOverride?: SupabaseClient,
  bucketName: string = SUPABASE_STORAGE_BUCKET
): Promise<{ signedUrl: string; token: string; path: string; publicUrl: string }> {
  const client = clientOverride || getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase is not configured on this server.");
  }

  const { data, error } = await client.storage
    .from(bucketName)
    .createSignedUploadUrl(filePath, { upsert: true });

  if (error || !data) {
    throw new Error(error?.message || "Failed to create signed upload URL.");
  }

  const { data: publicData } = client.storage
    .from(bucketName)
    .getPublicUrl(filePath);

  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: filePath,
    publicUrl: publicData.publicUrl,
  };
}

/**
 * Resolves the permanent public streaming URL for an audio file in a public bucket.
 */
export function getPublicAudioUrl(
  filePath: string,
  clientOverride?: SupabaseClient,
  bucketName: string = SUPABASE_STORAGE_BUCKET
): string {
  const client = clientOverride || getSupabaseAdminClient();
  if (!client) {
    return "";
  }
  const { data } = client.storage.from(bucketName).getPublicUrl(filePath);
  return data.publicUrl;
}

/**
 * Deletes an audio file from Supabase Storage to immediately reclaim storage.
 */
export async function deleteAudioFile(
  filePath: string,
  clientOverride?: SupabaseClient,
  bucketName: string = SUPABASE_STORAGE_BUCKET
): Promise<{ success: boolean }> {
  const client = clientOverride || getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase is not configured on this server.");
  }

  const cleanPath = filePath.replace(/^\/+/, "");
  const { error } = await client.storage.from(bucketName).remove([cleanPath]);

  if (error) {
    throw new Error(error.message || "Failed to delete audio file.");
  }

  return { success: true };
}

/**
 * Uploads an audio Buffer directly to Supabase Storage from the server.
 * Used for storing server-side extracted audio (e.g. YouTube audio extraction).
 */
export async function uploadAudioBuffer(
  filePath: string,
  buffer: Buffer,
  contentType: string = "audio/mpeg",
  clientOverride?: SupabaseClient,
  bucketName: string = SUPABASE_STORAGE_BUCKET
): Promise<{ path: string; publicUrl: string }> {
  const client = clientOverride || getSupabaseAdminClient();
  if (!client) {
    throw new Error("Supabase is not configured on this server.");
  }

  const cleanPath = filePath.replace(/^\/+/, "");
  const { error } = await client.storage
    .from(bucketName)
    .upload(cleanPath, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(error.message || "Failed to upload audio file to Supabase Storage.");
  }

  const { data } = client.storage.from(bucketName).getPublicUrl(cleanPath);
  return { path: cleanPath, publicUrl: data.publicUrl };
}

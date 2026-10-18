import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Pinned official standalone yt-dlp release
export const YTDLP_VERSION = "2026.08.19";

export const RELEASE_ASSETS = {
  linux: {
    asset: "yt-dlp_linux",
    sha256: "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a",
    filename: "yt-dlp",
  },
  darwin: {
    asset: "yt-dlp_macos",
    sha256: "0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202",
    filename: "yt-dlp",
  },
  win32: {
    asset: "yt-dlp.exe",
    sha256: "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a",
    filename: "yt-dlp.exe",
  },
};

export function computeSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function ensureYtDlp() {
  const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  // Default to linux asset if running in Vercel or target is linux
  const platform = isVercel ? "linux" : process.platform;
  const assetConfig = RELEASE_ASSETS[platform] || RELEASE_ASSETS.linux;

  const binDir = path.join(projectRoot, "bin");
  const targetPath = path.join(binDir, assetConfig.filename);
  const nodeModulesBinPath = path.join(
    projectRoot,
    "node_modules",
    "youtube-dl-exec",
    "bin",
    "yt-dlp"
  );

  fs.mkdirSync(binDir, { recursive: true });

  // 1. Check if bin/yt-dlp already exists and has valid checksum
  if (fs.existsSync(targetPath)) {
    try {
      const existingBuffer = fs.readFileSync(targetPath);
      const hash = computeSha256(existingBuffer);
      if (hash === assetConfig.sha256) {
        fs.chmodSync(targetPath, 0o755);
        syncToNodeModules(targetPath, nodeModulesBinPath);
        console.log(
          `[ensure-ytdlp] Verified standalone yt-dlp ${YTDLP_VERSION} (${assetConfig.asset}) at ${targetPath}.`
        );
        return targetPath;
      }
      console.warn(
        `[ensure-ytdlp] Existing binary hash mismatch (got ${hash}, expected ${assetConfig.sha256}). Re-downloading...`
      );
    } catch (readErr) {
      console.warn("[ensure-ytdlp] Error checking existing binary:", readErr);
    }
  }

  // 2. Download official standalone binary with pinned release and sha256 check
  const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/${assetConfig.asset}`;
  console.log(
    `[ensure-ytdlp] Downloading standalone yt-dlp ${YTDLP_VERSION} (${assetConfig.asset}) from ${downloadUrl}...`
  );

  const res = await fetch(downloadUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "SijomonsMusic/1.0",
    },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to download standalone yt-dlp: HTTP ${res.status} ${res.statusText}`
    );
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 3. Cryptographic integrity check
  const actualHash = computeSha256(buffer);
  if (actualHash !== assetConfig.sha256) {
    throw new Error(
      `SHA256 checksum mismatch for ${assetConfig.asset}!\nExpected: ${assetConfig.sha256}\nReceived: ${actualHash}`
    );
  }

  // 4. Write binary and set executable permissions
  fs.writeFileSync(targetPath, buffer, { mode: 0o755 });
  fs.chmodSync(targetPath, 0o755);
  console.log(
    `[ensure-ytdlp] Successfully installed and verified standalone yt-dlp ${YTDLP_VERSION} at ${targetPath}.`
  );

  syncToNodeModules(targetPath, nodeModulesBinPath);

  return targetPath;
}

function syncToNodeModules(srcPath, nodeModulesBinPath) {
  try {
    const parentDir = path.dirname(nodeModulesBinPath);
    if (fs.existsSync(parentDir)) {
      fs.copyFileSync(srcPath, nodeModulesBinPath);
      fs.chmodSync(nodeModulesBinPath, 0o755);
      console.log(`[ensure-ytdlp] Synced standalone binary to ${nodeModulesBinPath}.`);
    }
  } catch (syncErr) {
    // Non-fatal if node_modules is not writable or absent
    console.warn(`[ensure-ytdlp] Note: Could not sync to node_modules/youtube-dl-exec/bin:`, syncErr?.message);
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  ensureYtDlp()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[ensure-ytdlp] Fatal error:", err);
      process.exit(1);
    });
}

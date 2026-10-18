import type { NextConfig } from "next";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

// Ensure standalone yt-dlp binary is verified and in place before Next.js builds/traces
try {
  const scriptPath = path.resolve(process.cwd(), "scripts/ensure-ytdlp.mjs");
  if (fs.existsSync(scriptPath)) {
    execFileSync(process.execPath, [scriptPath], { stdio: "inherit" });
  }
} catch (err) {
  console.warn("[next.config] Warning during ensure-ytdlp execution:", err);
}

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  serverExternalPackages: ["youtube-dl-exec"],
  outputFileTracingIncludes: {
    "/api/**/*": [
      "./bin/**/*",
      "./node_modules/youtube-dl-exec/bin/**/*",
    ],
    "/api/youtube": [
      "./bin/**/*",
      "./node_modules/youtube-dl-exec/bin/**/*",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

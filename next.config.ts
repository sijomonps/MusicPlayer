import type { NextConfig } from "next";

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

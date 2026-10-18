import type { Song } from "./types.ts";

export const SUPPORTED_AUDIO_EXTENSIONS = [
  "mp3",
  "m4a",
  "aac",
  "ogg",
  "wav",
  "flac",
  "opus",
  "weba",
];

export function isYouTubeUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr.trim());
    return (
      url.hostname === "www.youtube.com" ||
      url.hostname === "youtube.com" ||
      url.hostname === "m.youtube.com" ||
      url.hostname === "youtu.be" ||
      url.hostname === "music.youtube.com"
    );
  } catch {
    return false;
  }
}

export function getAudioExtension(pathname: string): string | null {
  const match = pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match) return null;
  const ext = match[1];
  return SUPPORTED_AUDIO_EXTENSIONS.includes(ext) ? ext : null;
}

export function isAudioUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr.trim());
    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }
    const ext = getAudioExtension(url.pathname);
    return Boolean(ext);
  } catch {
    return false;
  }
}

export type YouTubeLinkKind =
  | "youtube_video"
  | "youtube_playlist"
  | "youtube_composite";

export interface AudioUrlValidationResult {
  isValid: boolean;
  type: "youtube" | "audio" | "invalid";
  kind?: YouTubeLinkKind;
  format?: string;
  error?: string;
  cleanUrl?: string;
  videoId?: string | null;
  playlistId?: string | null;
  isComposite?: boolean;
  isPlaylist?: boolean;
}

/**
 * Extracts the canonical 11-character YouTube video ID.
 */
export function extractYouTubeVideoId(urlStr: string): string | null {
  try {
    const trimmed = urlStr.trim();
    if (!trimmed) return null;

    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("youtu.be")) {
      const id = parsed.pathname.slice(1).split("/")[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (host.includes("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      const pathParts = parsed.pathname.split("/").filter(Boolean);
      if (["embed", "v", "shorts", "live"].includes(pathParts[0] || "")) {
        const id = pathParts[1];
        if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    }
  } catch {
    // Ignore invalid URL
  }
  return null;
}

/**
 * Extracts YouTube playlist ID from a URL (e.g. list=PL...).
 */
export function extractYouTubePlaylistId(urlStr: string): string | null {
  try {
    const trimmed = urlStr.trim();
    if (!trimmed) return null;

    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const list = parsed.searchParams.get("list");
    if (list && /^[a-zA-Z0-9_-]+$/.test(list)) {
      return list;
    }
  } catch {
    // Ignore invalid URL
  }
  return null;
}

export interface ParsedYouTubeUrl {
  isYouTube: boolean;
  videoId: string | null;
  playlistId: string | null;
  isComposite: boolean;
  isPlaylistOnly: boolean;
  isVideoOnly: boolean;
}

export function parseYouTubeUrl(urlStr: string): ParsedYouTubeUrl {
  const isYt = isYouTubeUrl(urlStr);
  if (!isYt) {
    return {
      isYouTube: false,
      videoId: null,
      playlistId: null,
      isComposite: false,
      isPlaylistOnly: false,
      isVideoOnly: false,
    };
  }

  const videoId = extractYouTubeVideoId(urlStr);
  const playlistId = extractYouTubePlaylistId(urlStr);
  const isComposite = Boolean(videoId && playlistId);
  const isPlaylistOnly = Boolean(!videoId && playlistId);
  const isVideoOnly = Boolean(videoId && !playlistId);

  return {
    isYouTube: true,
    videoId,
    playlistId,
    isComposite,
    isPlaylistOnly,
    isVideoOnly,
  };
}

/**
 * Validates a user-provided URL for either YouTube bookmark/playlist or direct audio streaming.
 */
export async function validateLinkInput(urlStr: string): Promise<AudioUrlValidationResult> {
  const trimmed = urlStr.trim();
  if (!trimmed) {
    return { isValid: false, type: "invalid", error: "Please enter a valid URL." };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        isValid: false,
        type: "invalid",
        error: "Only HTTP and HTTPS URLs are supported.",
      };
    }
  } catch {
    return {
      isValid: false,
      type: "invalid",
      error: "The provided URL is invalid. Please enter a complete URL starting with http:// or https://",
    };
  }

  // Check YouTube
  if (isYouTubeUrl(trimmed)) {
    const parsedYt = parseYouTubeUrl(trimmed);
    let resolvedKind: YouTubeLinkKind = "youtube_video";
    let resolvedFormat = "YouTube Video";

    if (parsedYt.isComposite) {
      resolvedKind = "youtube_composite";
      resolvedFormat = "YouTube Video & Playlist";
    } else if (parsedYt.isPlaylistOnly) {
      resolvedKind = "youtube_playlist";
      resolvedFormat = "YouTube Playlist";
    }

    return {
      isValid: true,
      type: "youtube",
      kind: resolvedKind,
      cleanUrl: trimmed,
      format: resolvedFormat,
      videoId: parsedYt.videoId,
      playlistId: parsedYt.playlistId,
      isComposite: parsedYt.isComposite,
      isPlaylist: parsedYt.isPlaylistOnly || parsedYt.isComposite,
    };
  }

  // Check direct audio extension
  const ext = getAudioExtension(parsed.pathname);
  if (ext) {
    return {
      isValid: true,
      type: "audio",
      cleanUrl: trimmed,
      format: ext.toUpperCase(),
    };
  }

  // If in browser and no known extension in pathname, probe the audio element to see if it can decode stream
  if (typeof window !== "undefined" && typeof Audio !== "undefined") {
    const probeResult = await probeAudioStream(trimmed);
    if (probeResult.playable) {
      return {
        isValid: true,
        type: "audio",
        cleanUrl: trimmed,
        format: probeResult.format || "Audio Stream",
      };
    }
  }

  return {
    isValid: false,
    type: "invalid",
    error:
      "The URL is not a supported audio stream. Please provide a direct link to an MP3, M4A, AAC, WAV, OGG, or FLAC file, or a YouTube video.",
  };
}

/**
 * Probes an audio URL using an HTML5 Audio element to verify it can decode stream metadata
 */
export function probeAudioStream(
  urlStr: string,
  timeoutMs: number = 2500
): Promise<{ playable: boolean; format?: string }> {
  return new Promise((resolve) => {
    let resolved = false;
    const audio = new Audio();
    audio.preload = "metadata";

    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("canplay", onLoaded);
      audio.removeEventListener("error", onError);
      audio.src = "";
    };

    const finish = (result: { playable: boolean; format?: string }) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ playable: false });
    }, timeoutMs);

    const onLoaded = () => {
      clearTimeout(timer);
      finish({ playable: true, format: "Audio Stream" });
    };

    const onError = () => {
      clearTimeout(timer);
      finish({ playable: false });
    };

    audio.addEventListener("loadedmetadata", onLoaded, { once: true });
    audio.addEventListener("canplay", onLoaded, { once: true });
    audio.addEventListener("error", onError, { once: true });

    try {
      audio.src = urlStr;
    } catch {
      clearTimeout(timer);
      finish({ playable: false });
    }
  });
}

export async function fetchYouTubeMetadata(urlStr: string): Promise<{
  title: string;
  artist: string;
  thumbnailUrl?: string;
}> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(urlStr.trim())}&format=json`
    );
    if (!res.ok) throw new Error("Could not fetch YouTube title");
    const data = await res.json();
    return {
      title: data.title || "YouTube Video",
      artist: data.author_name || "YouTube",
      thumbnailUrl: data.thumbnail_url,
    };
  } catch {
    return {
      title: "YouTube Bookmark",
      artist: "YouTube",
    };
  }
}

/**
 * Searches the library for an existing song corresponding to the given YouTube video ID.
 */
export function findExistingSongForYouTubeId(
  songs: Song[],
  videoId: string
): Song | undefined {
  if (!videoId) return undefined;
  return songs.find((s) => {
    if (s.youtube_video_id === videoId) return true;
    if (s.youtube_url) {
      const extracted = extractYouTubeVideoId(s.youtube_url);
      if (extracted === videoId) return true;
    }
    return false;
  });
}

/**
 * Checks whether a YouTube video ID is already contained within a specific playlist.
 */
export function isSongInPlaylist(
  playlistSongIds: string[],
  songs: Song[],
  videoId: string
): boolean {
  if (!videoId || !playlistSongIds || playlistSongIds.length === 0) return false;
  const playlistSet = new Set(playlistSongIds);

  return songs.some((s) => {
    if (!playlistSet.has(s.id)) return false;
    if (s.youtube_video_id === videoId) return true;
    if (s.youtube_url) {
      const extracted = extractYouTubeVideoId(s.youtube_url);
      if (extracted === videoId) return true;
    }
    return false;
  });
}

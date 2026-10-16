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

export interface AudioUrlValidationResult {
  isValid: boolean;
  type: "youtube" | "audio" | "invalid";
  format?: string;
  error?: string;
  cleanUrl?: string;
}

/**
 * Validates a user-provided URL for either YouTube bookmark or direct audio streaming.
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
    return {
      isValid: true,
      type: "youtube",
      cleanUrl: trimmed,
      format: "YouTube Bookmark",
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

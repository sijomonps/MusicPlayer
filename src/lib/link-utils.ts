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

export function isAudioUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr.trim());
    const pathname = url.pathname.toLowerCase();
    return (
      pathname.endsWith(".mp3") ||
      pathname.endsWith(".m4a") ||
      pathname.endsWith(".aac") ||
      pathname.endsWith(".ogg") ||
      pathname.endsWith(".wav") ||
      pathname.endsWith(".flac")
    );
  } catch {
    return false;
  }
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

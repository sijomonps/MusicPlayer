import { Song } from "./types";

export interface MediaSessionHandlers {
  onPlay: () => void;
  onPause: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSeekTo?: (time: number) => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
}

export function updateMediaSessionMetadata(song: Song | null) {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) {
    return;
  }

  if (!song) {
    navigator.mediaSession.metadata = null;
    return;
  }

  const artworkUrl =
    song.artwork_url ||
    "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=512&auto=format&fit=crop&q=80";

  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title,
    artist: song.artist,
    album: song.album || "Minimal Player",
    artwork: [
      { src: artworkUrl, sizes: "96x96", type: "image/jpeg" },
      { src: artworkUrl, sizes: "128x128", type: "image/jpeg" },
      { src: artworkUrl, sizes: "192x192", type: "image/jpeg" },
      { src: artworkUrl, sizes: "256x256", type: "image/jpeg" },
      { src: artworkUrl, sizes: "512x512", type: "image/jpeg" },
    ],
  });
}

export function updateMediaSessionPlaybackState(state: "playing" | "paused" | "none") {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) {
    return;
  }
  navigator.mediaSession.playbackState = state;
}

export function updateMediaSessionPositionState(
  currentTime: number,
  duration: number,
  playbackRate = 1.0
) {
  if (
    typeof window === "undefined" ||
    !("mediaSession" in navigator) ||
    typeof navigator.mediaSession.setPositionState !== "function"
  ) {
    return;
  }

  // Duration must be a positive finite number and position cannot exceed duration
  if (
    typeof duration === "number" &&
    isFinite(duration) &&
    duration > 0 &&
    typeof currentTime === "number" &&
    isFinite(currentTime) &&
    currentTime >= 0
  ) {
    try {
      navigator.mediaSession.setPositionState({
        duration: duration,
        playbackRate: playbackRate,
        position: Math.min(currentTime, duration),
      });
    } catch {
      // In case browser rejects invalid values, fail silently
    }
  }
}

export function registerMediaSessionHandlers(handlers: MediaSessionHandlers) {
  if (typeof window === "undefined" || !("mediaSession" in navigator)) {
    return;
  }

  const actions: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
    ["play", () => handlers.onPlay()],
    ["pause", () => handlers.onPause()],
    ["previoustrack", () => handlers.onPrevious()],
    ["nexttrack", () => handlers.onNext()],
    [
      "seekto",
      (details) => {
        if (typeof details.seekTime === "number" && handlers.onSeekTo) {
          handlers.onSeekTo(details.seekTime);
        }
      },
    ],
    [
      "seekbackward",
      (details) => {
        if (handlers.onSeekBackward) {
          handlers.onSeekBackward();
        } else if (handlers.onSeekTo) {
          const skip = details.seekOffset || 10;
          handlers.onSeekTo(Math.max(0, (details.seekTime || 0) - skip));
        }
      },
    ],
    [
      "seekforward",
      (details) => {
        if (handlers.onSeekForward) {
          handlers.onSeekForward();
        } else if (handlers.onSeekTo) {
          const skip = details.seekOffset || 10;
          handlers.onSeekTo((details.seekTime || 0) + skip);
        }
      },
    ],
  ];

  for (const [action, handler] of actions) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Some action types might not be supported on all browsers
    }
  }
}

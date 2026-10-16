export type SongSourceType =
  | "upload"
  | "direct_url"
  | "youtube_bookmark"
  | "youtube_extracted";

export interface Song {
  id: string;
  user_id?: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number; // duration in seconds
  audio_url: string; // direct streaming URL
  storage_path?: string; // Supabase Storage object path
  r2_key?: string; // Legacy Cloudflare R2 key for backward compatibility
  artwork_url?: string;
  source_type: SongSourceType;
  youtube_url?: string;
  created_at: string;
}

export interface Playlist {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  song_count?: number;
}

export interface PlaylistSong {
  id: string;
  playlist_id: string;
  song_id: string;
  position: number;
  added_at: string;
  song?: Song;
}

export type RepeatMode = "off" | "all" | "one";

export interface PlaybackState {
  currentSong: Song | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number; // 0 to 1
  isMuted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  queue: Song[];
  queueIndex: number;
  originalQueue: Song[]; // keeps original order when shuffle is toggled
}

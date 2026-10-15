import { Song, Playlist } from "./types";

export const SAMPLE_SONGS: Song[] = [
  {
    id: "sample-1",
    title: "SoundHelix Song 1",
    artist: "T. Schürger",
    album: "Algorithmic Explorations",
    duration: 372,
    audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    artwork_url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&auto=format&fit=crop&q=80",
    source_type: "direct_url",
    created_at: new Date(Date.now() - 3600000 * 24 * 3).toISOString(),
  },
  {
    id: "sample-2",
    title: "SoundHelix Song 2",
    artist: "T. Schürger",
    album: "Algorithmic Explorations",
    duration: 423,
    audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    artwork_url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&auto=format&fit=crop&q=80",
    source_type: "direct_url",
    created_at: new Date(Date.now() - 3600000 * 24 * 2).toISOString(),
  },
  {
    id: "sample-3",
    title: "SoundHelix Song 3",
    artist: "T. Schürger",
    album: "Algorithmic Explorations",
    duration: 345,
    audio_url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    artwork_url: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400&auto=format&fit=crop&q=80",
    source_type: "direct_url",
    created_at: new Date(Date.now() - 3600000 * 24 * 1).toISOString(),
  },
  {
    id: "sample-yt-1",
    title: "Lofi Hip Hop Radio - Beats to Relax/Study to",
    artist: "Lofi Girl",
    album: "YouTube Bookmark",
    audio_url: "",
    youtube_url: "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    artwork_url: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&auto=format&fit=crop&q=80",
    source_type: "youtube_bookmark",
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
];

export const SAMPLE_PLAYLISTS: Playlist[] = [
  {
    id: "playlist-favorites",
    name: "Favorites",
    description: "Curated personal selection",
    created_at: new Date(Date.now() - 3600000 * 48).toISOString(),
    updated_at: new Date().toISOString(),
    song_count: 3,
  },
  {
    id: "playlist-focus",
    name: "Focus & Chill",
    description: "Background music for deep work",
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date().toISOString(),
    song_count: 2,
  },
];

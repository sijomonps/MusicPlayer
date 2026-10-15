"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { Song, Playlist } from "./types";
import { SAMPLE_SONGS, SAMPLE_PLAYLISTS } from "./sample-data";

interface LibraryContextType {
  songs: Song[];
  playlists: Playlist[];
  isLoading: boolean;
  addSong: (song: Omit<Song, "id" | "created_at">) => Promise<Song>;
  deleteSong: (id: string) => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<Playlist>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  getPlaylistSongs: (playlistId: string) => Promise<Song[]>;
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  reorderPlaylistSongs: (playlistId: string, reorderedSongIds: string[]) => Promise<void>;
  refreshLibrary: () => Promise<void>;
}

const LibraryContext = createContext<LibraryContextType | null>(null);

const STORAGE_KEY_SONGS = "minimal_player_songs_v2";
const STORAGE_KEY_PLAYLISTS = "minimal_player_playlists_v2";
const STORAGE_KEY_PLAYLIST_SONGS = "minimal_player_playlist_songs_v2";

const DEFAULT_PLAYLIST_MAP: Record<string, string[]> = {
  "playlist-favorites": ["sample-1", "sample-2", "sample-3"],
  "playlist-focus": ["sample-1", "sample-2"],
};

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  // Initialize state synchronously from browser localStorage
  const [songs, setSongs] = useState<Song[]>(() => {
    if (typeof window === "undefined") return SAMPLE_SONGS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SONGS);
      if (saved) return JSON.parse(saved);
      localStorage.setItem(STORAGE_KEY_SONGS, JSON.stringify(SAMPLE_SONGS));
    } catch (e) {
      console.warn("Could not load songs from localStorage:", e);
    }
    return SAMPLE_SONGS;
  });

  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    if (typeof window === "undefined") return SAMPLE_PLAYLISTS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PLAYLISTS);
      if (saved) return JSON.parse(saved);
      localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(SAMPLE_PLAYLISTS));
    } catch (e) {
      console.warn("Could not load playlists from localStorage:", e);
    }
    return SAMPLE_PLAYLISTS;
  });

  const [playlistSongsMap, setPlaylistSongsMap] = useState<Record<string, string[]>>(() => {
    if (typeof window === "undefined") return DEFAULT_PLAYLIST_MAP;
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PLAYLIST_SONGS);
      if (saved) return JSON.parse(saved);
      localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(DEFAULT_PLAYLIST_MAP));
    } catch (e) {
      console.warn("Could not load playlist order from localStorage:", e);
    }
    return DEFAULT_PLAYLIST_MAP;
  });

  const [isLoading] = useState(false);

  // Reload data from localStorage
  const loadData = useCallback(() => {
    try {
      if (typeof window === "undefined") return;

      const savedSongs = localStorage.getItem(STORAGE_KEY_SONGS);
      if (savedSongs) setSongs(JSON.parse(savedSongs));

      const savedPlaylists = localStorage.getItem(STORAGE_KEY_PLAYLISTS);
      if (savedPlaylists) setPlaylists(JSON.parse(savedPlaylists));

      const savedMap = localStorage.getItem(STORAGE_KEY_PLAYLIST_SONGS);
      if (savedMap) setPlaylistSongsMap(JSON.parse(savedMap));
    } catch (e) {
      console.error("Error reloading library from localStorage:", e);
    }
  }, []);

  // Add song to library
  const addSong = useCallback(
    async (newSongData: Omit<Song, "id" | "created_at">): Promise<Song> => {
      const uniqueId = crypto.randomUUID();
      const newSong: Song = {
        ...newSongData,
        id: uniqueId,
        created_at: new Date().toISOString(),
      };

      setSongs((prev) => {
        const updated = [newSong, ...prev];
        try {
          localStorage.setItem(STORAGE_KEY_SONGS, JSON.stringify(updated));
        } catch (e) {
          console.error("Failed to save song to localStorage:", e);
        }
        return updated;
      });

      return newSong;
    },
    []
  );

  // Delete song from library and playlists
  const deleteSong = useCallback(async (id: string) => {
    setSongs((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY_SONGS, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to update songs in localStorage:", e);
      }
      return updated;
    });

    setPlaylistSongsMap((prev) => {
      const nextMap: Record<string, string[]> = {};
      for (const [plId, songIds] of Object.entries(prev)) {
        nextMap[plId] = songIds.filter((sid) => sid !== id);
      }
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
      } catch (e) {
        console.error("Failed to update playlist songs in localStorage:", e);
      }
      return nextMap;
    });
  }, []);

  // Create playlist
  const createPlaylist = useCallback(async (name: string, description?: string): Promise<Playlist> => {
    const uniqueId = crypto.randomUUID();
    const newPlaylist: Playlist = {
      id: uniqueId,
      name,
      description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      song_count: 0,
    };

    setPlaylists((prev) => {
      const updated = [newPlaylist, ...prev];
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save playlist in localStorage:", e);
      }
      return updated;
    });

    setPlaylistSongsMap((prev) => {
      const nextMap = { ...prev, [uniqueId]: [] };
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
      } catch (e) {
        console.error("Failed to save playlist map in localStorage:", e);
      }
      return nextMap;
    });

    return newPlaylist;
  }, []);

  // Rename playlist
  const renamePlaylist = useCallback(async (id: string, name: string) => {
    const updatedAt = new Date().toISOString();
    setPlaylists((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, name, updated_at: updatedAt } : p));
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to update playlist in localStorage:", e);
      }
      return updated;
    });
  }, []);

  // Delete playlist
  const deletePlaylist = useCallback(async (id: string) => {
    setPlaylists((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to update playlists in localStorage:", e);
      }
      return updated;
    });

    setPlaylistSongsMap((prev) => {
      const nextMap = { ...prev };
      delete nextMap[id];
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
      } catch (e) {
        console.error("Failed to update playlist songs in localStorage:", e);
      }
      return nextMap;
    });
  }, []);

  // Get ordered songs for a playlist
  const getPlaylistSongs = useCallback(
    async (playlistId: string): Promise<Song[]> => {
      const songIds = playlistSongsMap[playlistId] || [];
      const songMap = new Map(songs.map((s) => [s.id, s]));
      return songIds.map((id) => songMap.get(id)).filter((s): s is Song => Boolean(s));
    },
    [songs, playlistSongsMap]
  );

  // Add song to playlist
  const addSongToPlaylist = useCallback(async (playlistId: string, songId: string) => {
    setPlaylistSongsMap((prev) => {
      const current = prev[playlistId] || [];
      if (current.includes(songId)) return prev;
      const nextMap = { ...prev, [playlistId]: [...current, songId] };
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
      } catch (e) {
        console.error("Failed to save playlist songs:", e);
      }
      return nextMap;
    });

    setPlaylists((prev) => {
      const updated = prev.map((p) =>
        p.id === playlistId ? { ...p, song_count: (p.song_count || 0) + 1 } : p
      );
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to save playlist count:", e);
      }
      return updated;
    });
  }, []);

  // Remove song from playlist
  const removeSongFromPlaylist = useCallback(async (playlistId: string, songId: string) => {
    setPlaylistSongsMap((prev) => {
      const current = prev[playlistId] || [];
      const nextMap = { ...prev, [playlistId]: current.filter((id) => id !== songId) };
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
      } catch (e) {
        console.error("Failed to update playlist songs:", e);
      }
      return nextMap;
    });

    setPlaylists((prev) => {
      const updated = prev.map((p) =>
        p.id === playlistId ? { ...p, song_count: Math.max(0, (p.song_count || 1) - 1) } : p
      );
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(updated));
      } catch (e) {
        console.error("Failed to update playlist count:", e);
      }
      return updated;
    });
  }, []);

  // Reorder playlist songs and persist immediately
  const reorderPlaylistSongs = useCallback(async (playlistId: string, reorderedSongIds: string[]) => {
    setPlaylistSongsMap((prev) => {
      const nextMap = { ...prev, [playlistId]: reorderedSongIds };
      try {
        localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
      } catch (e) {
        console.error("Failed to save reordered playlist songs:", e);
      }
      return nextMap;
    });
  }, []);

  return (
    <LibraryContext.Provider
      value={{
        songs,
        playlists,
        isLoading,
        addSong,
        deleteSong,
        createPlaylist,
        renamePlaylist,
        deletePlaylist,
        getPlaylistSongs,
        addSongToPlaylist,
        removeSongFromPlaylist,
        reorderPlaylistSongs,
        refreshLibrary: async () => loadData(),
      }}
    >
      {children}
    </LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error("useLibrary must be used within a LibraryProvider");
  }
  return context;
}

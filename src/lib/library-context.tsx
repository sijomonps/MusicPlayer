"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Song, Playlist } from "./types";
import { SAMPLE_SONGS, SAMPLE_PLAYLISTS } from "./sample-data";
import { supabase, isSupabaseConfigured } from "./supabase/client";

interface LibraryContextType {
  songs: Song[];
  playlists: Playlist[];
  isLoading: boolean;
  isCloudSync: boolean;
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

const STORAGE_KEY_SONGS = "minimal_music_songs_v1";
const STORAGE_KEY_PLAYLISTS = "minimal_music_playlists_v1";
const STORAGE_KEY_PLAYLIST_SONGS = "minimal_music_playlist_songs_v1";

interface SupabasePlaylistRow {
  id: string;
  user_id?: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
  playlist_songs?: Array<{ count: number }>;
}

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistSongsMap, setPlaylistSongsMap] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Load initial data
  const loadData = useCallback(async () => {
    try {
      if (isSupabaseConfigured && supabase) {
        // Fetch from Supabase
        const { data: songsData, error: songsErr } = await supabase
          .from("songs")
          .select("*")
          .order("created_at", { ascending: false });

        if (!songsErr && songsData) {
          setSongs(songsData);
        }

        const { data: playlistsData, error: plErr } = await supabase
          .from("playlists")
          .select("*, playlist_songs(count)")
          .order("created_at", { ascending: false });

        if (!plErr && playlistsData) {
          const formatted = (playlistsData as unknown as SupabasePlaylistRow[]).map((p) => ({
            ...p,
            song_count: p.playlist_songs?.[0]?.count || 0,
          }));
          setPlaylists(formatted);
        }
      } else {
        // LocalStorage fallback
        const savedSongs = localStorage.getItem(STORAGE_KEY_SONGS);
        const savedPlaylists = localStorage.getItem(STORAGE_KEY_PLAYLISTS);
        const savedMap = localStorage.getItem(STORAGE_KEY_PLAYLIST_SONGS);

        if (savedSongs) {
          setSongs(JSON.parse(savedSongs));
        } else {
          setSongs(SAMPLE_SONGS);
          localStorage.setItem(STORAGE_KEY_SONGS, JSON.stringify(SAMPLE_SONGS));
        }

        if (savedPlaylists) {
          setPlaylists(JSON.parse(savedPlaylists));
        } else {
          setPlaylists(SAMPLE_PLAYLISTS);
          localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(SAMPLE_PLAYLISTS));
        }

        if (savedMap) {
          setPlaylistSongsMap(JSON.parse(savedMap));
        } else {
          const initialMap: Record<string, string[]> = {
            "playlist-favorites": ["sample-1", "sample-2", "sample-3"],
            "playlist-focus": ["sample-1", "sample-2"],
          };
          setPlaylistSongsMap(initialMap);
          localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(initialMap));
        }
      }
    } catch (e) {
      console.error("Error loading library data:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Add song
  const addSong = useCallback(
    async (newSongData: Omit<Song, "id" | "created_at">): Promise<Song> => {
      const uniqueId = crypto.randomUUID();
      const newSong: Song = {
        ...newSongData,
        id: uniqueId,
        created_at: new Date().toISOString(),
      };

      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase.from("songs").insert([newSong]).select().single();
        if (error) {
          throw new Error("Failed to save song to Supabase: " + error.message);
        }
        setSongs((prev) => [data, ...prev]);
        return data;
      } else {
        setSongs((prev) => {
          const updated = [newSong, ...prev];
          localStorage.setItem(STORAGE_KEY_SONGS, JSON.stringify(updated));
          return updated;
        });
        return newSong;
      }
    },
    []
  );

  // Delete song
  const deleteSong = useCallback(async (id: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("songs").delete().eq("id", id);
      if (error) throw new Error(error.message);
    }

    setSongs((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      if (!isSupabaseConfigured) {
        localStorage.setItem(STORAGE_KEY_SONGS, JSON.stringify(updated));
      }
      return updated;
    });

    // Remove from playlist maps
    setPlaylistSongsMap((prev) => {
      const nextMap: Record<string, string[]> = {};
      for (const [plId, songIds] of Object.entries(prev)) {
        nextMap[plId] = songIds.filter((sid) => sid !== id);
      }
      if (!isSupabaseConfigured) {
        localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
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

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from("playlists")
        .insert([{ id: uniqueId, name, description }])
        .select()
        .single();
      if (error) throw new Error(error.message);
      setPlaylists((prev) => [data, ...prev]);
      return data;
    } else {
      setPlaylists((prev) => {
        const updated = [newPlaylist, ...prev];
        localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(updated));
        return updated;
      });
      setPlaylistSongsMap((prev) => ({ ...prev, [uniqueId]: [] }));
      return newPlaylist;
    }
  }, []);

  // Rename playlist
  const renamePlaylist = useCallback(async (id: string, name: string) => {
    const updatedAt = new Date().toISOString();
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase
        .from("playlists")
        .update({ name, updated_at: updatedAt })
        .eq("id", id);
      if (error) throw new Error(error.message);
    }

    setPlaylists((prev) => {
      const updated = prev.map((p) => (p.id === id ? { ...p, name, updated_at: updatedAt } : p));
      if (!isSupabaseConfigured) {
        localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(updated));
      }
      return updated;
    });
  }, []);

  // Delete playlist
  const deletePlaylist = useCallback(async (id: string) => {
    if (isSupabaseConfigured && supabase) {
      const { error } = await supabase.from("playlists").delete().eq("id", id);
      if (error) throw new Error(error.message);
    }

    setPlaylists((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      if (!isSupabaseConfigured) {
        localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(updated));
      }
      return updated;
    });

    setPlaylistSongsMap((prev) => {
      const nextMap = { ...prev };
      delete nextMap[id];
      if (!isSupabaseConfigured) {
        localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
      }
      return nextMap;
    });
  }, []);

  // Get playlist songs in ordered sequence
  const getPlaylistSongs = useCallback(
    async (playlistId: string): Promise<Song[]> => {
      if (isSupabaseConfigured && supabase) {
        const { data, error } = await supabase
          .from("playlist_songs")
          .select("song_id, position, songs(*)")
          .eq("playlist_id", playlistId)
          .order("position", { ascending: true });

        if (error || !data) return [];
        return (data as unknown as Array<{ songs: Song }>).map((item) => item.songs).filter(Boolean);
      } else {
        const songIds = playlistSongsMap[playlistId] || [];
        const songMap = new Map(songs.map((s) => [s.id, s]));
        return songIds.map((id) => songMap.get(id)).filter((s): s is Song => Boolean(s));
      }
    },
    [songs, playlistSongsMap]
  );

  // Add song to playlist
  const addSongToPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      if (isSupabaseConfigured && supabase) {
        // Find highest position
        const { data } = await supabase
          .from("playlist_songs")
          .select("position")
          .eq("playlist_id", playlistId)
          .order("position", { ascending: false })
          .limit(1);

        const nextPos = data && data[0] ? data[0].position + 1 : 0;

        const { error } = await supabase.from("playlist_songs").insert([
          {
            playlist_id: playlistId,
            song_id: songId,
            position: nextPos,
          },
        ]);
        if (error) throw new Error(error.message);
      } else {
        setPlaylistSongsMap((prev) => {
          const current = prev[playlistId] || [];
          if (current.includes(songId)) return prev;
          const nextMap = { ...prev, [playlistId]: [...current, songId] };
          localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
          return nextMap;
        });
      }

      // Update count on playlist object
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId ? { ...p, song_count: (p.song_count || 0) + 1 } : p
        )
      );
    },
    []
  );

  // Remove song from playlist
  const removeSongFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      if (isSupabaseConfigured && supabase) {
        const { error } = await supabase
          .from("playlist_songs")
          .delete()
          .eq("playlist_id", playlistId)
          .eq("song_id", songId);
        if (error) throw new Error(error.message);
      } else {
        setPlaylistSongsMap((prev) => {
          const current = prev[playlistId] || [];
          const nextMap = { ...prev, [playlistId]: current.filter((id) => id !== songId) };
          localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
          return nextMap;
        });
      }

      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? { ...p, song_count: Math.max(0, (p.song_count || 1) - 1) }
            : p
        )
      );
    },
    []
  );

  // Reorder playlist songs
  const reorderPlaylistSongs = useCallback(
    async (playlistId: string, reorderedSongIds: string[]) => {
      if (isSupabaseConfigured && supabase) {
        // Upsert positions in Supabase
        const updates = reorderedSongIds.map((songId, index) => ({
          playlist_id: playlistId,
          song_id: songId,
          position: index,
        }));

        for (const item of updates) {
          await supabase
            .from("playlist_songs")
            .update({ position: item.position })
            .eq("playlist_id", item.playlist_id)
            .eq("song_id", item.song_id);
        }
      } else {
        setPlaylistSongsMap((prev) => {
          const nextMap = { ...prev, [playlistId]: reorderedSongIds };
          localStorage.setItem(STORAGE_KEY_PLAYLIST_SONGS, JSON.stringify(nextMap));
          return nextMap;
        });
      }
    },
    []
  );

  return (
    <LibraryContext.Provider
      value={{
        songs,
        playlists,
        isLoading,
        isCloudSync: isSupabaseConfigured,
        addSong,
        deleteSong,
        createPlaylist,
        renamePlaylist,
        deletePlaylist,
        getPlaylistSongs,
        addSongToPlaylist,
        removeSongFromPlaylist,
        reorderPlaylistSongs,
        refreshLibrary: loadData,
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

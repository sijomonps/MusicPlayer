"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Song, Playlist } from "./types";
import { SAMPLE_SONGS, SAMPLE_PLAYLISTS } from "./sample-data";

interface LibraryContextType {
  songs: Song[];
  playlists: Playlist[];
  playlistSongsMap: Record<string, string[]>;
  isLoading: boolean;
  isHydrated: boolean;
  addSong: (
    song: Omit<Song, "id" | "created_at"> | Song,
    playlistId?: string
  ) => Promise<Song>;
  deleteSong: (id: string) => Promise<void>;
  createPlaylist: (name: string, description?: string) => Promise<Playlist>;
  renamePlaylist: (id: string, name: string) => Promise<void>;
  deletePlaylist: (id: string) => Promise<void>;
  getPlaylistSongs: (playlistId: string) => Promise<Song[]>;
  addSongToPlaylist: (playlistId: string, songId: string) => Promise<void>;
  removeSongFromPlaylist: (playlistId: string, songId: string) => Promise<void>;
  reorderPlaylistSongs: (
    playlistId: string,
    reorderedSongIds: string[]
  ) => Promise<void>;
  refreshLibrary: () => Promise<void>;
}

const LibraryContext = createContext<LibraryContextType | null>(null);

const STORAGE_KEY_SONGS = "minimal_player_songs_v2";
const STORAGE_KEY_PLAYLISTS = "minimal_player_playlists_v2";
const STORAGE_KEY_PLAYLIST_SONGS = "minimal_player_playlist_songs_v2";

const SONGS_STORAGE_KEY = STORAGE_KEY_SONGS;
const PLAYLISTS_STORAGE_KEY = STORAGE_KEY_PLAYLISTS;
const PLAYLIST_SONGS_STORAGE_KEY = STORAGE_KEY_PLAYLIST_SONGS;

const DEFAULT_PLAYLIST_MAP: Record<string, string[]> = {
  "playlist-favorites": ["sample-1", "sample-2", "sample-3"],
  "playlist-focus": ["sample-1", "sample-2"],
};
const SAMPLE_PLAYLIST_SONGS = DEFAULT_PLAYLIST_MAP;

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  // 1. Always initialize with deterministic values for SSR + first client render
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistSongsMap, setPlaylistSongsMap] = useState<
    Record<string, string[]>
  >({});
  const [isHydrated, setIsHydrated] = useState(false);

  // 2. Read localStorage ONLY inside useEffect (runs on client after hydration)
  useEffect(() => {
    try {
      const savedSongs = localStorage.getItem(SONGS_STORAGE_KEY);
      if (savedSongs) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSongs(JSON.parse(savedSongs));
      } else {
        setSongs(SAMPLE_SONGS);
        localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(SAMPLE_SONGS));
      }

      const savedPlaylists = localStorage.getItem(PLAYLISTS_STORAGE_KEY);
      if (savedPlaylists) {
        setPlaylists(JSON.parse(savedPlaylists));
      } else {
        setPlaylists(SAMPLE_PLAYLISTS);
        localStorage.setItem(
          PLAYLISTS_STORAGE_KEY,
          JSON.stringify(SAMPLE_PLAYLISTS)
        );
      }

      const savedPlaylistSongs = localStorage.getItem(
        PLAYLIST_SONGS_STORAGE_KEY
      );
      if (savedPlaylistSongs) {
        setPlaylistSongsMap(JSON.parse(savedPlaylistSongs));
      } else {
        setPlaylistSongsMap(SAMPLE_PLAYLIST_SONGS);
        localStorage.setItem(
          PLAYLIST_SONGS_STORAGE_KEY,
          JSON.stringify(SAMPLE_PLAYLIST_SONGS)
        );
      }
    } catch (err) {
      console.error("Failed to load library from localStorage:", err);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // 3. Guard save effects with `if (!isHydrated) return;`
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(SONGS_STORAGE_KEY, JSON.stringify(songs));
    } catch (err) {
      console.error("Failed to save songs to localStorage:", err);
    }
  }, [songs, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
    } catch (err) {
      console.error("Failed to save playlists to localStorage:", err);
    }
  }, [playlists, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(
        PLAYLIST_SONGS_STORAGE_KEY,
        JSON.stringify(playlistSongsMap)
      );
    } catch (err) {
      console.error("Failed to save playlist songs to localStorage:", err);
    }
  }, [playlistSongsMap, isHydrated]);

  // Reload data from localStorage
  const loadData = useCallback(() => {
    try {
      if (typeof window === "undefined") return;

      const savedSongs = localStorage.getItem(SONGS_STORAGE_KEY);
      if (savedSongs) setSongs(JSON.parse(savedSongs));

      const savedPlaylists = localStorage.getItem(PLAYLISTS_STORAGE_KEY);
      if (savedPlaylists) setPlaylists(JSON.parse(savedPlaylists));

      const savedMap = localStorage.getItem(PLAYLIST_SONGS_STORAGE_KEY);
      if (savedMap) setPlaylistSongsMap(JSON.parse(savedMap));
    } catch (e) {
      console.error("Error reloading library from localStorage:", e);
    }
  }, []);

  // Add song to library and optionally assign to playlist atomically
  const addSong = useCallback(
    async (
      newSongData: Omit<Song, "id" | "created_at"> | Song,
      playlistId?: string
    ): Promise<Song> => {
      const uniqueId =
        "id" in newSongData && newSongData.id
          ? newSongData.id
          : crypto.randomUUID();
      const newSong: Song = {
        ...newSongData,
        id: uniqueId,
        created_at:
          "created_at" in newSongData && newSongData.created_at
            ? newSongData.created_at
            : new Date().toISOString(),
      };

      setSongs((prev) => [newSong, ...prev.filter((s) => s.id !== newSong.id)]);

      if (playlistId) {
        setPlaylistSongsMap((prev) => {
          const current = prev[playlistId] || [];
          if (current.includes(newSong.id)) return prev;
          return { ...prev, [playlistId]: [...current, newSong.id] };
        });

        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === playlistId
              ? { ...p, song_count: (p.song_count || 0) + 1 }
              : p
          )
        );
      }

      return newSong;
    },
    []
  );

  // Delete song from library and playlists
  const deleteSong = useCallback(
    async (id: string) => {
      const songToDelete = songs.find((s) => s.id === id);
      if (songToDelete) {
        const storagePath = songToDelete.storage_path || songToDelete.r2_key;
        if (storagePath) {
          try {
            const secret =
              typeof window !== "undefined"
                ? localStorage.getItem("minimal_upload_secret") || ""
                : "";
            const res = await fetch(
              `/api/upload?path=${encodeURIComponent(storagePath)}`,
              {
                method: "DELETE",
                headers: secret ? { "x-upload-secret": secret } : {},
              }
            );
            if (res.ok && typeof window !== "undefined") {
              window.dispatchEvent(new Event("storage_updated"));
            }
          } catch (e) {
            console.warn("Failed to delete audio from storage backend:", e);
          }
        }
      }

      setSongs((prev) => prev.filter((s) => s.id !== id));
      setPlaylistSongsMap((prev) => {
        const nextMap: Record<string, string[]> = {};
        for (const [plId, songIds] of Object.entries(prev)) {
          nextMap[plId] = songIds.filter((sid) => sid !== id);
        }
        return nextMap;
      });
      setPlaylists((prev) =>
        prev.map((p) => {
          const count = (playlistSongsMap[p.id] || []).filter(
            (sid) => sid !== id
          ).length;
          return { ...p, song_count: count };
        })
      );
    },
    [songs, playlistSongsMap]
  );

  // Create playlist
  const createPlaylist = useCallback(
    async (name: string, description?: string): Promise<Playlist> => {
      const uniqueId = crypto.randomUUID();
      const newPlaylist: Playlist = {
        id: uniqueId,
        name,
        description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        song_count: 0,
      };

      setPlaylists((prev) => [newPlaylist, ...prev]);
      setPlaylistSongsMap((prev) => ({ ...prev, [uniqueId]: [] }));

      return newPlaylist;
    },
    []
  );

  // Rename playlist
  const renamePlaylist = useCallback(async (id: string, name: string) => {
    const updatedAt = new Date().toISOString();
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, name, updated_at: updatedAt } : p
      )
    );
  }, []);

  // Delete playlist
  const deletePlaylist = useCallback(async (id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    setPlaylistSongsMap((prev) => {
      const nextMap = { ...prev };
      delete nextMap[id];
      return nextMap;
    });
  }, []);

  // Get ordered songs for a playlist
  const getPlaylistSongs = useCallback(
    async (playlistId: string): Promise<Song[]> => {
      const songIds = playlistSongsMap[playlistId] || [];
      const songMap = new Map(songs.map((s) => [s.id, s]));
      return songIds
        .map((id) => songMap.get(id))
        .filter((s): s is Song => Boolean(s));
    },
    [songs, playlistSongsMap]
  );

  // Add song to playlist
  const addSongToPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      setPlaylistSongsMap((prev) => {
        const current = prev[playlistId] || [];
        if (current.includes(songId)) return prev;
        return { ...prev, [playlistId]: [...current, songId] };
      });

      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? { ...p, song_count: (p.song_count || 0) + 1 }
            : p
        )
      );
    },
    []
  );

  // Remove song from playlist
  const removeSongFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      setPlaylistSongsMap((prev) => {
        const current = prev[playlistId] || [];
        return { ...prev, [playlistId]: current.filter((id) => id !== songId) };
      });

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

  // Reorder songs in playlist
  const reorderPlaylistSongs = useCallback(
    async (playlistId: string, reorderedSongIds: string[]) => {
      setPlaylistSongsMap((prev) => ({
        ...prev,
        [playlistId]: reorderedSongIds,
      }));
    },
    []
  );

  const isLoading = !isHydrated;

  return (
    <LibraryContext.Provider
      value={{
        songs,
        playlists,
        playlistSongsMap,
        isLoading,
        isHydrated,
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

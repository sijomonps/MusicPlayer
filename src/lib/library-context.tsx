"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { Song, Playlist } from "./types";
import { SAMPLE_SONGS, SAMPLE_PLAYLISTS } from "./sample-data";
import { supabase, isSupabaseConfigured } from "./supabase/client";

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

const LEGACY_STORAGE_KEY_SONGS = "minimal_player_songs_v2";
const LEGACY_STORAGE_KEY_PLAYLISTS = "minimal_player_playlists_v2";
const LEGACY_STORAGE_KEY_PLAYLIST_SONGS = "minimal_player_playlist_songs_v2";
const MIGRATION_DONE_KEY = "sijomons_music_migrated_v1";

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [playlistSongsMap, setPlaylistSongsMap] = useState<
    Record<string, string[]>
  >({});
  const [isHydrated, setIsHydrated] = useState(false);

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Core library fetch from Supabase Database
  const fetchLibrary = useCallback(async () => {
    if (!supabase || !isSupabaseConfigured) {
      // Offline / Unconfigured fallback: Use sample data
      setSongs((prev) => (prev.length > 0 ? prev : SAMPLE_SONGS));
      setPlaylists((prev) => (prev.length > 0 ? prev : SAMPLE_PLAYLISTS));
      setPlaylistSongsMap((prev) => prev);
      setIsHydrated(true);
      return;
    }

    try {
      const [songsRes, playlistsRes, plSongsRes] = await Promise.all([
        supabase
          .from("songs")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("playlists")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("playlist_songs")
          .select("*")
          .order("position", { ascending: true }),
      ]);

      if (songsRes.error) {
        console.warn("Could not query songs table:", songsRes.error.message);
      }
      if (playlistsRes.error) {
        console.warn("Could not query playlists table:", playlistsRes.error.message);
      }
      if (plSongsRes.error) {
        console.warn("Could not query playlist_songs table:", plSongsRes.error.message);
      }

      let fetchedSongs: Song[] = songsRes.data || [];
      let fetchedPlaylists: Playlist[] = playlistsRes.data || [];
      const fetchedPlSongs = plSongsRes.data || [];

      // Safe one-time migration from localStorage on this device
      if (typeof window !== "undefined") {
        const isMigrated = localStorage.getItem(MIGRATION_DONE_KEY);
        if (!isMigrated) {
          const rawLocalSongs = localStorage.getItem(LEGACY_STORAGE_KEY_SONGS);
          const rawLocalPlaylists = localStorage.getItem(
            LEGACY_STORAGE_KEY_PLAYLISTS
          );
          const rawLocalPlSongs = localStorage.getItem(
            LEGACY_STORAGE_KEY_PLAYLIST_SONGS
          );

          if (rawLocalSongs || rawLocalPlaylists || rawLocalPlSongs) {
            try {
              const localSongs: Song[] = rawLocalSongs
                ? JSON.parse(rawLocalSongs)
                : [];
              const localPlaylists: Playlist[] = rawLocalPlaylists
                ? JSON.parse(rawLocalPlaylists)
                : [];
              const localPlSongs: Record<string, string[]> = rawLocalPlSongs
                ? JSON.parse(rawLocalPlSongs)
                : {};

              // Find songs not yet present in Supabase
              const remoteSongIds = new Set(fetchedSongs.map((s) => s.id));
              const remoteAudioUrls = new Set(
                fetchedSongs.map((s) => s.audio_url).filter(Boolean)
              );
              const songsToMigrate = localSongs.filter(
                (s) =>
                  !remoteSongIds.has(s.id) &&
                  (!s.audio_url || !remoteAudioUrls.has(s.audio_url))
              );

              // Find playlists not yet present in Supabase
              const remotePlaylistIds = new Set(
                fetchedPlaylists.map((p) => p.id)
              );
              const remotePlaylistNames = new Set(
                fetchedPlaylists.map((p) => p.name.toLowerCase().trim())
              );
              const playlistsToMigrate = localPlaylists.filter(
                (p) =>
                  !remotePlaylistIds.has(p.id) &&
                  !remotePlaylistNames.has(p.name.toLowerCase().trim())
              );

              // Migrate missing songs
              if (songsToMigrate.length > 0) {
                const songRows = songsToMigrate.map((s) => ({
                  id: s.id,
                  title: s.title,
                  artist: s.artist,
                  album: s.album || null,
                  duration: s.duration || null,
                  audio_url: s.audio_url,
                  artwork_url: s.artwork_url || null,
                  source_type: s.source_type,
                  storage_path: s.storage_path || null,
                  r2_key: s.r2_key || null,
                  youtube_url: s.youtube_url || null,
                  created_at: s.created_at || new Date().toISOString(),
                }));
                const { error: songInsErr } = await supabase
                  .from("songs")
                  .upsert(songRows, { onConflict: "id", ignoreDuplicates: true });
                if (!songInsErr) {
                  fetchedSongs = [...songsToMigrate, ...fetchedSongs];
                }
              }

              // Migrate missing playlists
              if (playlistsToMigrate.length > 0) {
                const plRows = playlistsToMigrate.map((p) => ({
                  id: p.id,
                  name: p.name,
                  description: p.description || null,
                  created_at: p.created_at || new Date().toISOString(),
                  updated_at: p.updated_at || new Date().toISOString(),
                }));
                const { error: plInsErr } = await supabase
                  .from("playlists")
                  .upsert(plRows, { onConflict: "id", ignoreDuplicates: true });
                if (!plInsErr) {
                  fetchedPlaylists = [...playlistsToMigrate, ...fetchedPlaylists];
                }
              }

              // Migrate missing playlist song associations
              const existingPlSongPairs = new Set(
                fetchedPlSongs.map(
                  (ps) => `${ps.playlist_id}:::${ps.song_id}`
                )
              );
              const plSongsToInsert: Array<{
                id: string;
                playlist_id: string;
                song_id: string;
                position: number;
                added_at: string;
              }> = [];

              for (const [plId, songIds] of Object.entries(localPlSongs)) {
                songIds.forEach((songId, idx) => {
                  const key = `${plId}:::${songId}`;
                  if (!existingPlSongPairs.has(key)) {
                    plSongsToInsert.push({
                      id: crypto.randomUUID(),
                      playlist_id: plId,
                      song_id: songId,
                      position: idx,
                      added_at: new Date().toISOString(),
                    });
                  }
                });
              }

              if (plSongsToInsert.length > 0) {
                await supabase.from("playlist_songs").insert(plSongsToInsert);
              }

              // Clean up legacy localStorage storage keys after successful migration
              localStorage.removeItem(LEGACY_STORAGE_KEY_SONGS);
              localStorage.removeItem(LEGACY_STORAGE_KEY_PLAYLISTS);
              localStorage.removeItem(LEGACY_STORAGE_KEY_PLAYLIST_SONGS);
              localStorage.removeItem("minimal_upload_secret");
              localStorage.setItem(MIGRATION_DONE_KEY, "true");
            } catch (migErr) {
              console.error(
                "Migration from localStorage encountered error, retaining backup:",
                migErr
              );
            }
          } else {
            localStorage.setItem(MIGRATION_DONE_KEY, "true");
          }
        }
      }

      // If remote database is completely empty on initial setup, seed sample tracks
      if (fetchedSongs.length === 0 && fetchedPlaylists.length === 0) {
        try {
          const sampleRows = SAMPLE_SONGS.map((s) => ({
            id: s.id,
            title: s.title,
            artist: s.artist,
            album: s.album || null,
            duration: s.duration || null,
            audio_url: s.audio_url,
            artwork_url: s.artwork_url || null,
            source_type: s.source_type,
            created_at: s.created_at || new Date().toISOString(),
          }));
          await supabase
            .from("songs")
            .upsert(sampleRows, { onConflict: "id", ignoreDuplicates: true });
          await supabase
            .from("playlists")
            .upsert(SAMPLE_PLAYLISTS, {
              onConflict: "id",
              ignoreDuplicates: true,
            });
          fetchedSongs = SAMPLE_SONGS;
          fetchedPlaylists = SAMPLE_PLAYLISTS;
        } catch (seedErr) {
          console.warn("Could not seed initial sample songs into Supabase:", seedErr);
        }
      }

      // Build playlist songs map & compute song counts
      const map: Record<string, string[]> = {};
      fetchedPlaylists.forEach((p) => {
        map[p.id] = [];
      });
      fetchedPlSongs.forEach((ps) => {
        if (!map[ps.playlist_id]) {
          map[ps.playlist_id] = [];
        }
        if (!map[ps.playlist_id].includes(ps.song_id)) {
          map[ps.playlist_id].push(ps.song_id);
        }
      });

      const enrichedPlaylists = fetchedPlaylists.map((p) => ({
        ...p,
        song_count: map[p.id]?.length || 0,
      }));

      setSongs(fetchedSongs);
      setPlaylists(enrichedPlaylists);
      setPlaylistSongsMap(map);
    } catch (err) {
      console.error("Failed to fetch library from Supabase:", err);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // 2. Debounced fetch for Supabase Realtime updates
  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      fetchLibrary();
    }, 150);
  }, [fetchLibrary]);

  // 3. Mount effect: Wipe browser cache, unregister service workers, and subscribe to Supabase Realtime
  useEffect(() => {
    // Zero-cache policy: clear browser Cache Storage and unregister service workers
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("minimal_upload_secret");
      } catch {
        // Ignore
      }

      if ("caches" in window) {
        caches
          .keys()
          .then((names) => {
            names.forEach((name) => caches.delete(name));
          })
          .catch(() => {});
      }

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => {
            registrations.forEach((reg) => reg.unregister());
          })
          .catch(() => {});
      }
    }

    // Initial fetch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLibrary();

    // Subscribe to Supabase Realtime database changes across all devices
    const client = supabase;
    if (client && isSupabaseConfigured) {
      const channel = client
        .channel("sijomons-realtime-library")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "songs" },
          () => {
            debouncedFetch();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "playlists" },
          () => {
            debouncedFetch();
          }
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "playlist_songs" },
          () => {
            debouncedFetch();
          }
        )
        .subscribe();

      return () => {
        client.removeChannel(channel);
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current);
        }
      };
    }
  }, [fetchLibrary, debouncedFetch]);

  // 4. Mutation: Add Song (optimistic update + Supabase insert)
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

      // Optimistic UI updates
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

      // Persist to Supabase Database
      if (supabase && isSupabaseConfigured) {
        try {
          await supabase.from("songs").upsert({
            id: newSong.id,
            title: newSong.title,
            artist: newSong.artist,
            album: newSong.album || null,
            duration: newSong.duration || null,
            audio_url: newSong.audio_url,
            artwork_url: newSong.artwork_url || null,
            source_type: newSong.source_type,
            storage_path: newSong.storage_path || null,
            r2_key: newSong.r2_key || null,
            youtube_url: newSong.youtube_url || null,
            created_at: newSong.created_at,
          });

          if (playlistId) {
            const currentIds = playlistSongsMap[playlistId] || [];
            await supabase.from("playlist_songs").insert({
              id: crypto.randomUUID(),
              playlist_id: playlistId,
              song_id: newSong.id,
              position: currentIds.length,
              added_at: new Date().toISOString(),
            });
          }
        } catch (dbErr) {
          console.error("Failed to sync new song to Supabase:", dbErr);
        }
      }

      return newSong;
    },
    [playlistSongsMap]
  );

  // 5. Mutation: Delete Song
  const deleteSong = useCallback(
    async (id: string) => {
      const songToDelete = songs.find((s) => s.id === id);

      // Optimistic UI updates
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

      // Delete storage file if present
      if (songToDelete) {
        const storagePath = songToDelete.storage_path || songToDelete.r2_key;
        if (storagePath) {
          try {
            const res = await fetch(
              `/api/upload?path=${encodeURIComponent(storagePath)}`,
              {
                method: "DELETE",
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

      // Persist deletion to Supabase
      if (supabase && isSupabaseConfigured) {
        try {
          await supabase.from("playlist_songs").delete().eq("song_id", id);
          await supabase.from("songs").delete().eq("id", id);
        } catch (dbErr) {
          console.error("Failed to delete song from Supabase:", dbErr);
        }
      }
    },
    [songs, playlistSongsMap]
  );

  // 6. Mutation: Create Playlist
  const createPlaylist = useCallback(
    async (name: string, description?: string): Promise<Playlist> => {
      const uniqueId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newPlaylist: Playlist = {
        id: uniqueId,
        name,
        description,
        created_at: now,
        updated_at: now,
        song_count: 0,
      };

      // Optimistic UI update
      setPlaylists((prev) => [newPlaylist, ...prev]);
      setPlaylistSongsMap((prev) => ({ ...prev, [uniqueId]: [] }));

      // Persist to Supabase
      if (supabase && isSupabaseConfigured) {
        try {
          await supabase.from("playlists").insert({
            id: newPlaylist.id,
            name: newPlaylist.name,
            description: newPlaylist.description || null,
            created_at: newPlaylist.created_at,
            updated_at: newPlaylist.updated_at,
          });
        } catch (dbErr) {
          console.error("Failed to create playlist in Supabase:", dbErr);
        }
      }

      return newPlaylist;
    },
    []
  );

  // 7. Mutation: Rename Playlist
  const renamePlaylist = useCallback(async (id: string, name: string) => {
    const updatedAt = new Date().toISOString();
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, name, updated_at: updatedAt } : p
      )
    );

    if (supabase && isSupabaseConfigured) {
      try {
        await supabase
          .from("playlists")
          .update({ name, updated_at: updatedAt })
          .eq("id", id);
      } catch (dbErr) {
        console.error("Failed to rename playlist in Supabase:", dbErr);
      }
    }
  }, []);

  // 8. Mutation: Delete Playlist
  const deletePlaylist = useCallback(async (id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    setPlaylistSongsMap((prev) => {
      const nextMap = { ...prev };
      delete nextMap[id];
      return nextMap;
    });

    if (supabase && isSupabaseConfigured) {
      try {
        await supabase.from("playlist_songs").delete().eq("playlist_id", id);
        await supabase.from("playlists").delete().eq("id", id);
      } catch (dbErr) {
        console.error("Failed to delete playlist from Supabase:", dbErr);
      }
    }
  }, []);

  // 9. Query: Get ordered songs for a playlist
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

  // 10. Mutation: Add Song to Playlist
  const addSongToPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      const current = playlistSongsMap[playlistId] || [];
      if (current.includes(songId)) return;

      setPlaylistSongsMap((prev) => ({
        ...prev,
        [playlistId]: [...(prev[playlistId] || []), songId],
      }));

      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? { ...p, song_count: (p.song_count || 0) + 1 }
            : p
        )
      );

      if (supabase && isSupabaseConfigured) {
        try {
          await supabase.from("playlist_songs").insert({
            id: crypto.randomUUID(),
            playlist_id: playlistId,
            song_id: songId,
            position: current.length,
            added_at: new Date().toISOString(),
          });
        } catch (dbErr) {
          console.error("Failed to add song to playlist in Supabase:", dbErr);
        }
      }
    },
    [playlistSongsMap]
  );

  // 11. Mutation: Remove Song from Playlist
  const removeSongFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      setPlaylistSongsMap((prev) => ({
        ...prev,
        [playlistId]: (prev[playlistId] || []).filter((id) => id !== songId),
      }));

      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId
            ? { ...p, song_count: Math.max(0, (p.song_count || 1) - 1) }
            : p
        )
      );

      if (supabase && isSupabaseConfigured) {
        try {
          await supabase
            .from("playlist_songs")
            .delete()
            .eq("playlist_id", playlistId)
            .eq("song_id", songId);
        } catch (dbErr) {
          console.error("Failed to remove song from playlist in Supabase:", dbErr);
        }
      }
    },
    []
  );

  // 12. Mutation: Reorder Songs in Playlist
  const reorderPlaylistSongs = useCallback(
    async (playlistId: string, reorderedSongIds: string[]) => {
      setPlaylistSongsMap((prev) => ({
        ...prev,
        [playlistId]: reorderedSongIds,
      }));

      if (supabase && isSupabaseConfigured) {
        try {
          // Re-insert positions 0..n
          await supabase
            .from("playlist_songs")
            .delete()
            .eq("playlist_id", playlistId);

          if (reorderedSongIds.length > 0) {
            const rows = reorderedSongIds.map((songId, index) => ({
              id: crypto.randomUUID(),
              playlist_id: playlistId,
              song_id: songId,
              position: index,
              added_at: new Date().toISOString(),
            }));
            await supabase.from("playlist_songs").insert(rows);
          }
        } catch (dbErr) {
          console.error("Failed to reorder playlist songs in Supabase:", dbErr);
        }
      }
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
        refreshLibrary: fetchLibrary,
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

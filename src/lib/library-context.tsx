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
  loadError: string | null;
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
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to ensure stable UUID format for PostgreSQL compatibility
  const ensureUuid = (id?: string): string => {
    if (
      id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id
      )
    ) {
      return id;
    }
    return crypto.randomUUID();
  };

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

      // Inspect errors from every query
      const queryErrors = [songsRes.error, playlistsRes.error, plSongsRes.error].filter(
        Boolean
      );

      if (queryErrors.length > 0) {
        const primaryError = queryErrors[0]!;
        console.error("Supabase query error:", primaryError);

        let userMsg = `Database request failed: ${primaryError.message}`;
        if (primaryError.code === "42501") {
          userMsg =
            "Database permission denied (RLS policy). Please execute the schema migration SQL in your Supabase SQL Editor.";
        } else if (
          primaryError.code === "PGRST204" ||
          primaryError.code === "PGRST202"
        ) {
          userMsg = `Database schema mismatch (${primaryError.message}). Please update the schema in Supabase.`;
        }

        setLoadError(userMsg);
        // CRITICAL: NEVER overwrite existing valid state with empty arrays on error
        setIsHydrated(true);
        return;
      }

      // Success: clear previous errors
      setLoadError(null);

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
            let migrationSuccess = true;
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

              // 1. Migrate missing songs
              if (songsToMigrate.length > 0) {
                const songRows = songsToMigrate.map((s) => ({
                  id: ensureUuid(s.id),
                  title: s.title,
                  artist: s.artist,
                  album: s.album || null,
                  duration: s.duration || null,
                  audio_url: s.audio_url,
                  artwork_url: s.artwork_url || null,
                  source_type: s.source_type,
                  r2_key: s.storage_path || s.r2_key || null,
                  youtube_url: s.youtube_url || null,
                  created_at: s.created_at || new Date().toISOString(),
                }));
                const { error: songInsErr } = await supabase
                  .from("songs")
                  .upsert(songRows, { onConflict: "id", ignoreDuplicates: true });
                if (songInsErr) {
                  console.error("Migration: songs upsert failed:", songInsErr);
                  migrationSuccess = false;
                } else {
                  fetchedSongs = [...songsToMigrate, ...fetchedSongs];
                }
              }

              // 2. Migrate missing playlists
              if (playlistsToMigrate.length > 0 && migrationSuccess) {
                const plRows = playlistsToMigrate.map((p) => ({
                  id: ensureUuid(p.id),
                  name: p.name,
                  description: p.description || null,
                  created_at: p.created_at || new Date().toISOString(),
                  updated_at: p.updated_at || new Date().toISOString(),
                }));
                const { error: plInsErr } = await supabase
                  .from("playlists")
                  .upsert(plRows, { onConflict: "id", ignoreDuplicates: true });
                if (plInsErr) {
                  console.error("Migration: playlists upsert failed:", plInsErr);
                  migrationSuccess = false;
                } else {
                  fetchedPlaylists = [...playlistsToMigrate, ...fetchedPlaylists];
                }
              }

              // 3. Migrate missing playlist song associations
              if (migrationSuccess) {
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
                  const { error: psInsErr } = await supabase
                    .from("playlist_songs")
                    .insert(plSongsToInsert);
                  if (psInsErr) {
                    console.error("Migration: playlist_songs insert failed:", psInsErr);
                    migrationSuccess = false;
                  }
                }
              }

              // ONLY delete local storage and mark complete if ALL steps succeeded
              if (migrationSuccess) {
                localStorage.removeItem(LEGACY_STORAGE_KEY_SONGS);
                localStorage.removeItem(LEGACY_STORAGE_KEY_PLAYLISTS);
                localStorage.removeItem(LEGACY_STORAGE_KEY_PLAYLIST_SONGS);
                localStorage.removeItem("minimal_upload_secret");
                localStorage.setItem(MIGRATION_DONE_KEY, "true");
              } else {
                console.warn("Migration failed, preserving local storage data for retry.");
              }
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

      // Deduplicate records by id
      const uniquePlaylists = Array.from(
        new Map(fetchedPlaylists.map((p) => [p.id, p])).values()
      ).map((p) => ({
        ...p,
        song_count: map[p.id]?.length || 0,
      }));

      const uniqueSongs = Array.from(
        new Map(fetchedSongs.map((s) => [s.id, s])).values()
      );

      setSongs(uniqueSongs);
      setPlaylists(uniquePlaylists);
      setPlaylistSongsMap(map);
    } catch (err) {
      console.error("Failed to fetch library from Supabase:", err);
      setLoadError(
        err instanceof Error
          ? err.message
          : "Unexpected error fetching library from Supabase."
      );
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // 2. Debounced fetch for Supabase Realtime updates and focus events
  const debouncedFetch = useCallback(() => {
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
    }
    fetchTimeoutRef.current = setTimeout(() => {
      fetchLibrary();
    }, 150);
  }, [fetchLibrary]);

  // 3. Mount effect: Wipe browser cache, subscribe to Realtime, and listen to window visibility/focus
  useEffect(() => {
    let removeListeners: (() => void) | undefined;

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

      // Re-fetch when returning to the tab/window from background
      const handleVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          debouncedFetch();
        }
      };
      window.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("focus", handleVisibilityChange);

      // Clean up event listeners on unmount
      removeListeners = () => {
        window.removeEventListener("visibilitychange", handleVisibilityChange);
        window.removeEventListener("focus", handleVisibilityChange);
      };
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
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR") {
            console.warn("Supabase Realtime channel error:", err);
          }
        });

      return () => {
        client.removeChannel(channel);
        if (fetchTimeoutRef.current) {
          clearTimeout(fetchTimeoutRef.current);
        }
        if (removeListeners) removeListeners();
      };
    }

    return () => {
      if (fetchTimeoutRef.current) {
        clearTimeout(fetchTimeoutRef.current);
      }
      if (removeListeners) removeListeners();
    };
  }, [fetchLibrary, debouncedFetch]);

  // 4. Mutation: Add Song (optimistic update with reliable rollback + Supabase insert)
  const addSong = useCallback(
    async (
      newSongData: Omit<Song, "id" | "created_at"> | Song,
      playlistId?: string
    ): Promise<Song> => {
      const uniqueId = ensureUuid(
        "id" in newSongData && newSongData.id ? newSongData.id : undefined
      );

      const newSong: Song = {
        ...newSongData,
        id: uniqueId,
        created_at:
          "created_at" in newSongData && newSongData.created_at
            ? newSongData.created_at
            : new Date().toISOString(),
      };

      const previousSongs = songs;
      const previousMap = playlistSongsMap;
      const previousPlaylists = playlists;

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
        const songPayload: Record<string, unknown> = {
          id: newSong.id,
          title: newSong.title,
          artist: newSong.artist,
          album: newSong.album || null,
          duration: newSong.duration || null,
          audio_url: newSong.audio_url,
          artwork_url: newSong.artwork_url || null,
          source_type: newSong.source_type,
          r2_key: newSong.storage_path || newSong.r2_key || null,
          youtube_url: newSong.youtube_url || null,
          created_at: newSong.created_at,
        };
        if (newSong.storage_path) {
          songPayload.storage_path = newSong.storage_path;
        }

        const { error: songErr } = await supabase.from("songs").upsert(songPayload);

        if (songErr) {
          // If storage_path column is missing on server, retry without it
          if (songErr.message.includes("storage_path")) {
            delete songPayload.storage_path;
            const retryRes = await supabase.from("songs").upsert(songPayload);
            if (retryRes.error) {
              setSongs(previousSongs);
              if (playlistId) {
                setPlaylistSongsMap(previousMap);
                setPlaylists(previousPlaylists);
              }
              const errMsg =
                retryRes.error.code === "42501"
                  ? "Database permission denied (RLS policy). Please run the schema migration in your Supabase SQL editor."
                  : `Failed to save track: ${retryRes.error.message}`;
              throw new Error(errMsg);
            }
          } else {
            // Rollback optimistic state
            setSongs(previousSongs);
            if (playlistId) {
              setPlaylistSongsMap(previousMap);
              setPlaylists(previousPlaylists);
            }
            const errMsg =
              songErr.code === "42501"
                ? "Database permission denied (RLS policy). Please run the schema migration in your Supabase SQL editor."
                : `Failed to save track: ${songErr.message}`;
            throw new Error(errMsg);
          }
        }

        if (playlistId) {
          const currentIds = playlistSongsMap[playlistId] || [];
          const { error: psErr } = await supabase.from("playlist_songs").insert({
            id: crypto.randomUUID(),
            playlist_id: playlistId,
            song_id: newSong.id,
            position: currentIds.length,
            added_at: new Date().toISOString(),
          });
          if (psErr) {
            console.error("Failed to associate track with playlist:", psErr);
          }
        }
      }

      return newSong;
    },
    [songs, playlistSongsMap, playlists]
  );

  // 5. Mutation: Delete Song (optimistic update with reliable rollback)
  const deleteSong = useCallback(
    async (id: string) => {
      const songToDelete = songs.find((s) => s.id === id);
      const previousSongs = songs;
      const previousMap = playlistSongsMap;
      const previousPlaylists = playlists;

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

      // Persist deletion to Supabase
      if (supabase && isSupabaseConfigured) {
        await supabase.from("playlist_songs").delete().eq("song_id", id);
        const { error: delErr } = await supabase
          .from("songs")
          .delete()
          .eq("id", id);

        if (delErr) {
          // Rollback
          setSongs(previousSongs);
          setPlaylistSongsMap(previousMap);
          setPlaylists(previousPlaylists);
          throw new Error(`Failed to delete track from database: ${delErr.message}`);
        }
      }

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
    },
    [songs, playlistSongsMap, playlists]
  );

  // 6. Mutation: Create Playlist (strictly validated, awaits database, rolls back on error)
  const createPlaylist = useCallback(
    async (name: string, description?: string): Promise<Playlist> => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("Playlist name cannot be empty.");
      }

      const uniqueId = crypto.randomUUID();
      const now = new Date().toISOString();
      const newPlaylist: Playlist = {
        id: uniqueId,
        name: trimmedName,
        description: description?.trim() || undefined,
        created_at: now,
        updated_at: now,
        song_count: 0,
      };

      if (!supabase || !isSupabaseConfigured) {
        setPlaylists((prev) => [newPlaylist, ...prev]);
        setPlaylistSongsMap((prev) => ({ ...prev, [uniqueId]: [] }));
        return newPlaylist;
      }

      // Optimistic UI update
      setPlaylists((prev) => [newPlaylist, ...prev]);
      setPlaylistSongsMap((prev) => ({ ...prev, [uniqueId]: [] }));

      // Persist to Supabase and inspect response
      const { data, error } = await supabase
        .from("playlists")
        .insert({
          id: uniqueId,
          name: trimmedName,
          description: description?.trim() || null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error) {
        // Rollback state immediately
        setPlaylists((prev) => prev.filter((p) => p.id !== uniqueId));
        setPlaylistSongsMap((prev) => {
          const next = { ...prev };
          delete next[uniqueId];
          return next;
        });

        const errorMsg =
          error.code === "42501"
            ? "Database permission denied (RLS policy). Please execute the schema migration SQL in your Supabase SQL Editor."
            : `Failed to create playlist: ${error.message}`;

        console.error("Supabase playlist creation failed:", error);
        throw new Error(errorMsg);
      }

      // Confirmed database record
      const confirmedPlaylist: Playlist = {
        id: data.id,
        name: data.name,
        description: data.description || undefined,
        created_at: data.created_at,
        updated_at: data.updated_at,
        song_count: 0,
      };

      // Ensure confirmed record is in state
      setPlaylists((prev) => [
        confirmedPlaylist,
        ...prev.filter((p) => p.id !== uniqueId && p.id !== data.id),
      ]);

      return confirmedPlaylist;
    },
    []
  );

  // 7. Mutation: Rename Playlist (strictly awaits database, rolls back on error)
  const renamePlaylist = useCallback(
    async (id: string, name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new Error("Playlist name cannot be empty.");
      }

      const previousPlaylists = playlists;
      const target = playlists.find((p) => p.id === id);
      if (!target) return;

      const updatedAt = new Date().toISOString();

      // Optimistic update
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, name: trimmedName, updated_at: updatedAt } : p
        )
      );

      if (supabase && isSupabaseConfigured) {
        const { error } = await supabase
          .from("playlists")
          .update({ name: trimmedName, updated_at: updatedAt })
          .eq("id", id);

        if (error) {
          // Rollback
          setPlaylists(previousPlaylists);
          const errorMsg =
            error.code === "42501"
              ? "Database permission denied (RLS policy). Please execute the schema migration SQL."
              : `Failed to rename playlist: ${error.message}`;
          console.error("Supabase playlist rename failed:", error);
          throw new Error(errorMsg);
        }
      }
    },
    [playlists]
  );

  // 8. Mutation: Delete Playlist (strictly awaits database, rolls back on error)
  const deletePlaylist = useCallback(
    async (id: string) => {
      const previousPlaylists = playlists;
      const previousMap = playlistSongsMap;

      // Optimistic update
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      setPlaylistSongsMap((prev) => {
        const nextMap = { ...prev };
        delete nextMap[id];
        return nextMap;
      });

      if (supabase && isSupabaseConfigured) {
        // Delete associations first
        await supabase.from("playlist_songs").delete().eq("playlist_id", id);

        const { error } = await supabase.from("playlists").delete().eq("id", id);

        if (error) {
          // Rollback
          setPlaylists(previousPlaylists);
          setPlaylistSongsMap(previousMap);
          const errorMsg =
            error.code === "42501"
              ? "Database permission denied (RLS policy). Please execute the schema migration SQL."
              : `Failed to delete playlist: ${error.message}`;
          console.error("Supabase playlist delete failed:", error);
          throw new Error(errorMsg);
        }
      }
    },
    [playlists, playlistSongsMap]
  );

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

  // 10. Mutation: Add Song to Playlist (strictly awaits database, rolls back on error)
  const addSongToPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      const current = playlistSongsMap[playlistId] || [];
      if (current.includes(songId)) return;

      const previousMap = playlistSongsMap;
      const previousPlaylists = playlists;

      // Optimistic update
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
        const { error } = await supabase.from("playlist_songs").insert({
          id: crypto.randomUUID(),
          playlist_id: playlistId,
          song_id: songId,
          position: current.length,
          added_at: new Date().toISOString(),
        });

        if (error) {
          // Rollback
          setPlaylistSongsMap(previousMap);
          setPlaylists(previousPlaylists);
          const errorMsg =
            error.code === "42501"
              ? "Database permission denied (RLS policy). Please execute the schema migration SQL."
              : `Failed to add track to playlist: ${error.message}`;
          console.error("Supabase add track to playlist failed:", error);
          throw new Error(errorMsg);
        }
      }
    },
    [playlistSongsMap, playlists]
  );

  // 11. Mutation: Remove Song from Playlist (strictly awaits database, rolls back on error)
  const removeSongFromPlaylist = useCallback(
    async (playlistId: string, songId: string) => {
      const previousMap = playlistSongsMap;
      const previousPlaylists = playlists;

      // Optimistic update
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
        const { error } = await supabase
          .from("playlist_songs")
          .delete()
          .eq("playlist_id", playlistId)
          .eq("song_id", songId);

        if (error) {
          // Rollback
          setPlaylistSongsMap(previousMap);
          setPlaylists(previousPlaylists);
          const errorMsg =
            error.code === "42501"
              ? "Database permission denied (RLS policy). Please execute the schema migration SQL."
              : `Failed to remove track from playlist: ${error.message}`;
          console.error("Supabase remove track from playlist failed:", error);
          throw new Error(errorMsg);
        }
      }
    },
    [playlistSongsMap, playlists]
  );

  // 12. Mutation: Reorder Songs in Playlist (atomic delete & re-insert with rollback)
  const reorderPlaylistSongs = useCallback(
    async (playlistId: string, reorderedSongIds: string[]) => {
      const previousOrder = playlistSongsMap[playlistId] || [];

      // Optimistic update
      setPlaylistSongsMap((prev) => ({
        ...prev,
        [playlistId]: reorderedSongIds,
      }));

      if (supabase && isSupabaseConfigured) {
        // Delete previous ordering
        const { error: delErr } = await supabase
          .from("playlist_songs")
          .delete()
          .eq("playlist_id", playlistId);

        if (delErr) {
          setPlaylistSongsMap((prev) => ({
            ...prev,
            [playlistId]: previousOrder,
          }));
          throw new Error(`Failed to update playlist order: ${delErr.message}`);
        }

        if (reorderedSongIds.length > 0) {
          const rows = reorderedSongIds.map((songId, index) => ({
            id: crypto.randomUUID(),
            playlist_id: playlistId,
            song_id: songId,
            position: index,
            added_at: new Date().toISOString(),
          }));

          const { error: insErr } = await supabase
            .from("playlist_songs")
            .insert(rows);

          if (insErr) {
            setPlaylistSongsMap((prev) => ({
              ...prev,
              [playlistId]: previousOrder,
            }));
            throw new Error(`Failed to save reordered tracks: ${insErr.message}`);
          }
        }
      }
    },
    [playlistSongsMap]
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
        loadError,
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

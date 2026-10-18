import type { Song, Playlist } from "./types.ts";

export const LEGACY_STORAGE_KEY_SONGS = "minimal_player_songs_v2";
export const LEGACY_STORAGE_KEY_PLAYLISTS = "minimal_player_playlists_v2";
export const LEGACY_STORAGE_KEY_PLAYLIST_SONGS = "minimal_player_playlist_songs_v2";
export const MIGRATION_DONE_KEY = "sijomons_music_migrated_v1";

export function ensureUuid(id?: string): string {
  if (
    id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  ) {
    return id;
  }
  return crypto.randomUUID();
}

export interface MinimalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

/**
 * PlaylistSyncEngine manages playlist state transitions, Supabase database synchronization,
 * optimistic updates, and strict rollback on error.
 */
export class PlaylistSyncEngine {
  public songs: Song[] = [];
  public playlists: Playlist[] = [];
  public playlistSongsMap: Record<string, string[]> = {};
  public loadError: string | null = null;
  public isHydrated = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public client: any;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(client: any, initial?: { songs?: Song[]; playlists?: Playlist[]; map?: Record<string, string[]> }) {
    this.client = client;
    if (initial?.songs) this.songs = [...initial.songs];
    if (initial?.playlists) this.playlists = [...initial.playlists];
    if (initial?.map) this.playlistSongsMap = { ...initial.map };
  }

  /**
   * Fetch library state from Supabase Database.
   * If any query fails, existing in-memory state is preserved and loadError is populated.
   */
  async fetchLibrary(storage?: MinimalStorage): Promise<void> {
    if (!this.client) {
      this.isHydrated = true;
      return;
    }

    try {
      const [songsRes, playlistsRes, plSongsRes] = await Promise.all([
        this.client
          .from("songs")
          .select("*")
          .order("created_at", { ascending: false }),
        this.client
          .from("playlists")
          .select("*")
          .order("created_at", { ascending: false }),
        this.client
          .from("playlist_songs")
          .select("*")
          .order("position", { ascending: true }),
      ]);

      const queryErrors = [songsRes.error, playlistsRes.error, plSongsRes.error].filter(
        Boolean
      );

      if (queryErrors.length > 0) {
        const primaryError = queryErrors[0]!;
        let userMsg = `Database request failed: ${primaryError.message}`;
        if (primaryError.code === "42501") {
          userMsg =
            "Database permission denied (RLS policy). Please execute the schema migration SQL in your Supabase SQL Editor.";
        }
        this.loadError = userMsg;
        // CRITICAL: NEVER overwrite existing valid state with empty arrays on error
        this.isHydrated = true;
        return;
      }

      this.loadError = null;

      let fetchedSongs: Song[] = songsRes.data || [];
      let fetchedPlaylists: Playlist[] = playlistsRes.data || [];
      const fetchedPlSongs = plSongsRes.data || [];

      // Handle one-time migration if storage provided
      if (storage) {
        const isMigrated = storage.getItem(MIGRATION_DONE_KEY);
        if (!isMigrated) {
          const rawLocalSongs = storage.getItem(LEGACY_STORAGE_KEY_SONGS);
          const rawLocalPlaylists = storage.getItem(LEGACY_STORAGE_KEY_PLAYLISTS);
          const rawLocalPlSongs = storage.getItem(LEGACY_STORAGE_KEY_PLAYLIST_SONGS);

          if (rawLocalSongs || rawLocalPlaylists || rawLocalPlSongs) {
            let migrationSuccess = true;
            try {
              const localSongs: Song[] = rawLocalSongs ? JSON.parse(rawLocalSongs) : [];
              const localPlaylists: Playlist[] = rawLocalPlaylists
                ? JSON.parse(rawLocalPlaylists)
                : [];
              const localPlSongs: Record<string, string[]> = rawLocalPlSongs
                ? JSON.parse(rawLocalPlSongs)
                : {};

              const remoteSongIds = new Set(fetchedSongs.map((s) => s.id));
              const songsToMigrate = localSongs.filter((s) => !remoteSongIds.has(s.id));

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
                const { error: songInsErr } = await this.client
                  .from("songs")
                  .upsert(songRows, { onConflict: "id", ignoreDuplicates: true });
                if (songInsErr) {
                  migrationSuccess = false;
                } else {
                  fetchedSongs = [...songsToMigrate, ...fetchedSongs];
                }
              }

              const remotePlaylistIds = new Set(fetchedPlaylists.map((p) => p.id));
              const playlistsToMigrate = localPlaylists.filter(
                (p) => !remotePlaylistIds.has(p.id)
              );

              if (playlistsToMigrate.length > 0 && migrationSuccess) {
                const plRows = playlistsToMigrate.map((p) => ({
                  id: ensureUuid(p.id),
                  name: p.name,
                  description: p.description || null,
                  created_at: p.created_at || new Date().toISOString(),
                  updated_at: p.updated_at || new Date().toISOString(),
                }));
                const { error: plInsErr } = await this.client
                  .from("playlists")
                  .upsert(plRows, { onConflict: "id", ignoreDuplicates: true });
                if (plInsErr) {
                  migrationSuccess = false;
                } else {
                  fetchedPlaylists = [...playlistsToMigrate, ...fetchedPlaylists];
                }
              }

              if (migrationSuccess) {
                const plSongsToInsert: Array<{
                  id: string;
                  playlist_id: string;
                  song_id: string;
                  position: number;
                  added_at: string;
                }> = [];

                for (const [plId, songIds] of Object.entries(localPlSongs)) {
                  songIds.forEach((songId, idx) => {
                    plSongsToInsert.push({
                      id: crypto.randomUUID(),
                      playlist_id: plId,
                      song_id: songId,
                      position: idx,
                      added_at: new Date().toISOString(),
                    });
                  });
                }

                if (plSongsToInsert.length > 0) {
                  const { error: psInsErr } = await this.client
                    .from("playlist_songs")
                    .insert(plSongsToInsert);
                  if (psInsErr) {
                    migrationSuccess = false;
                  }
                }
              }

              // ONLY delete localStorage if all operations succeeded
              if (migrationSuccess) {
                storage.removeItem(LEGACY_STORAGE_KEY_SONGS);
                storage.removeItem(LEGACY_STORAGE_KEY_PLAYLISTS);
                storage.removeItem(LEGACY_STORAGE_KEY_PLAYLIST_SONGS);
                storage.setItem(MIGRATION_DONE_KEY, "true");
              }
            } catch {
              // Migration error: keep local storage untouched for retry
            }
          } else {
            storage.setItem(MIGRATION_DONE_KEY, "true");
          }
        }
      }

      // Build playlist map
      const map: Record<string, string[]> = {};
      fetchedPlaylists.forEach((p) => {
        map[p.id] = [];
      });
      fetchedPlSongs.forEach((ps: { playlist_id: string; song_id: string }) => {
        if (!map[ps.playlist_id]) {
          map[ps.playlist_id] = [];
        }
        if (!map[ps.playlist_id].includes(ps.song_id)) {
          map[ps.playlist_id].push(ps.song_id);
        }
      });

      // Deduplicate playlists by id and compute song_count
      const uniquePlaylists = Array.from(
        new Map(fetchedPlaylists.map((p) => [p.id, p])).values()
      ).map((p) => ({
        ...p,
        song_count: map[p.id]?.length || 0,
      }));

      // Deduplicate songs by id
      const uniqueSongs = Array.from(
        new Map(fetchedSongs.map((s) => [s.id, s])).values()
      );

      this.songs = uniqueSongs;
      this.playlists = uniquePlaylists;
      this.playlistSongsMap = map;
    } catch (err) {
      this.loadError =
        err instanceof Error ? err.message : "Unexpected database error.";
    } finally {
      this.isHydrated = true;
    }
  }

  /**
   * Create playlist: optimistic insertion with rollback on database failure.
   */
  async createPlaylist(name: string, description?: string): Promise<Playlist> {
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

    // Optimistic state update
    this.playlists = [newPlaylist, ...this.playlists];
    this.playlistSongsMap = { ...this.playlistSongsMap, [uniqueId]: [] };

    if (!this.client) {
      return newPlaylist;
    }

    const { data, error } = await this.client
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
      // Rollback optimistic state
      this.playlists = this.playlists.filter((p) => p.id !== uniqueId);
      const nextMap = { ...this.playlistSongsMap };
      delete nextMap[uniqueId];
      this.playlistSongsMap = nextMap;

      const errorMsg =
        error.code === "42501"
          ? "Database permission denied (RLS policy). Please execute the schema migration SQL in your Supabase SQL Editor."
          : `Failed to create playlist: ${error.message}`;
      throw new Error(errorMsg);
    }

    const confirmed: Playlist = {
      id: data.id,
      name: data.name,
      description: data.description || undefined,
      created_at: data.created_at,
      updated_at: data.updated_at,
      song_count: 0,
    };

    this.playlists = [
      confirmed,
      ...this.playlists.filter((p) => p.id !== uniqueId && p.id !== data.id),
    ];

    return confirmed;
  }

  /**
   * Rename playlist: optimistic update with rollback on failure.
   */
  async renamePlaylist(id: string, name: string): Promise<void> {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error("Playlist name cannot be empty.");
    }

    const previousPlaylists = [...this.playlists];
    const target = this.playlists.find((p) => p.id === id);
    if (!target) return;

    const updatedAt = new Date().toISOString();
    this.playlists = this.playlists.map((p) =>
      p.id === id ? { ...p, name: trimmedName, updated_at: updatedAt } : p
    );

    if (this.client) {
      const { error } = await this.client
        .from("playlists")
        .update({ name: trimmedName, updated_at: updatedAt })
        .eq("id", id);

      if (error) {
        this.playlists = previousPlaylists;
        throw new Error(`Failed to rename playlist: ${error.message}`);
      }
    }
  }

  /**
   * Delete playlist: removes associations and playlist row, rolling back on failure.
   */
  async deletePlaylist(id: string): Promise<void> {
    const previousPlaylists = [...this.playlists];
    const previousMap = { ...this.playlistSongsMap };

    this.playlists = this.playlists.filter((p) => p.id !== id);
    const nextMap = { ...this.playlistSongsMap };
    delete nextMap[id];
    this.playlistSongsMap = nextMap;

    if (this.client) {
      await this.client.from("playlist_songs").delete().eq("playlist_id", id);
      const { error } = await this.client.from("playlists").delete().eq("id", id);

      if (error) {
        this.playlists = previousPlaylists;
        this.playlistSongsMap = previousMap;
        throw new Error(`Failed to delete playlist: ${error.message}`);
      }
    }
  }

  /**
   * Add song to playlist: increments song count and updates associations.
   */
  async addSongToPlaylist(playlistId: string, songId: string): Promise<void> {
    const current = this.playlistSongsMap[playlistId] || [];
    if (current.includes(songId)) return;

    const previousMap = { ...this.playlistSongsMap };
    const previousPlaylists = [...this.playlists];

    this.playlistSongsMap = {
      ...this.playlistSongsMap,
      [playlistId]: [...current, songId],
    };

    this.playlists = this.playlists.map((p) =>
      p.id === playlistId ? { ...p, song_count: (p.song_count || 0) + 1 } : p
    );

    if (this.client) {
      const { error } = await this.client.from("playlist_songs").insert({
        id: crypto.randomUUID(),
        playlist_id: playlistId,
        song_id: songId,
        position: current.length,
        added_at: new Date().toISOString(),
      });

      if (error) {
        this.playlistSongsMap = previousMap;
        this.playlists = previousPlaylists;
        throw new Error(`Failed to add track to playlist: ${error.message}`);
      }
    }
  }

  /**
   * Remove song from playlist: decrements song count and updates associations.
   */
  async removeSongFromPlaylist(playlistId: string, songId: string): Promise<void> {
    const current = this.playlistSongsMap[playlistId] || [];
    if (!current.includes(songId)) return;

    const previousMap = { ...this.playlistSongsMap };
    const previousPlaylists = [...this.playlists];

    this.playlistSongsMap = {
      ...this.playlistSongsMap,
      [playlistId]: current.filter((id) => id !== songId),
    };

    this.playlists = this.playlists.map((p) =>
      p.id === playlistId ? { ...p, song_count: Math.max(0, (p.song_count || 1) - 1) } : p
    );

    if (this.client) {
      const { error } = await this.client
        .from("playlist_songs")
        .delete()
        .eq("playlist_id", playlistId)
        .eq("song_id", songId);

      if (error) {
        this.playlistSongsMap = previousMap;
        this.playlists = previousPlaylists;
        throw new Error(`Failed to remove track from playlist: ${error.message}`);
      }
    }
  }

  /**
   * Reorder playlist songs: sets new ordering positions with rollback on error.
   */
  async reorderPlaylistSongs(playlistId: string, reorderedSongIds: string[]): Promise<void> {
    const previousOrder = this.playlistSongsMap[playlistId] || [];

    this.playlistSongsMap = {
      ...this.playlistSongsMap,
      [playlistId]: [...reorderedSongIds],
    };

    if (this.client) {
      const { error: delErr } = await this.client
        .from("playlist_songs")
        .delete()
        .eq("playlist_id", playlistId);

      if (delErr) {
        this.playlistSongsMap = {
          ...this.playlistSongsMap,
          [playlistId]: previousOrder,
        };
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

        const { error: insErr } = await this.client
          .from("playlist_songs")
          .insert(rows);

        if (insErr) {
          this.playlistSongsMap = {
            ...this.playlistSongsMap,
            [playlistId]: previousOrder,
          };
          throw new Error(`Failed to save reordered tracks: ${insErr.message}`);
        }
      }
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import test from "node:test";
import assert from "node:assert/strict";
import {
  PlaylistSyncEngine,
  LEGACY_STORAGE_KEY_PLAYLISTS,
  LEGACY_STORAGE_KEY_SONGS,
  LEGACY_STORAGE_KEY_PLAYLIST_SONGS,
  MIGRATION_DONE_KEY,
  type MinimalStorage,
} from "../src/lib/playlist-service.ts";
import {
  validateYouTubeExtractionInput,
  formatYouTubeError,
  fetchOEmbedMetadata,
  checkFileSizeLimit,
  rollbackUploadedAudio,
} from "../src/lib/youtube-service.ts";
import type { Song, Playlist } from "../src/lib/types.ts";

/**
 * High-fidelity in-memory Mock Supabase Database Client
 */
class MockSupabaseDatabaseClient {
  public songs: Song[] = [];
  public playlists: Playlist[] = [];
  public playlistSongs: Array<{
    id: string;
    playlist_id: string;
    song_id: string;
    position: number;
    added_at: string;
  }> = [];

  // Failure simulation flags
  public failInsertRls = false;
  public failSelect = false;
  public failUpdate = false;
  public failDelete = false;

  from(table: string) {
    return {
      select: () => {
        const queryState: {
          table: string;
          filters: Array<{ field: string; val: any }>;
          orderField?: string;
          ascending?: boolean;
        } = {
          table,
          filters: [],
        };

        const queryObj = {
          order: (field: string, opts?: { ascending?: boolean }) => {
            queryState.orderField = field;
            queryState.ascending = opts?.ascending ?? true;
            return queryObj;
          },
          eq: (field: string, val: any) => {
            queryState.filters.push({ field, val });
            return queryObj;
          },
          single: async () => {
            const res = await queryObj.then((r: any) => r);
            if (res.error) return res;
            return { data: res.data?.[0] || null, error: null };
          },
          then: (resolve: any) => {
            if (this.failSelect) {
              return resolve({
                data: null,
                error: {
                  code: "PGRST500",
                  message: "Simulated database connection failure",
                },
              });
            }

            let rows: any[] = [];
            if (table === "songs") rows = [...this.songs];
            if (table === "playlists") rows = [...this.playlists];
            if (table === "playlist_songs") rows = [...this.playlistSongs];

            for (const f of queryState.filters) {
              rows = rows.filter((r) => r[f.field] === f.val);
            }

            return resolve({ data: rows, error: null });
          },
        };

        return queryObj;
      },

      insert: (values: any | any[]) => {
        const rowsToInsert = Array.isArray(values) ? values : [values];

        const insertObj = {
          select: () => ({
            single: async () => {
              if (this.failInsertRls) {
                return {
                  data: null,
                  error: {
                    code: "42501",
                    message: "new row violates row-level security policy for table",
                  },
                };
              }

              const row = rowsToInsert[0];
              if (table === "playlists") this.playlists.push(row);
              if (table === "songs") this.songs.push(row);
              if (table === "playlist_songs") this.playlistSongs.push(row);

              return { data: row, error: null };
            },
          }),
          then: (resolve: any) => {
            if (this.failInsertRls) {
              return resolve({
                data: null,
                error: {
                  code: "42501",
                  message: "new row violates row-level security policy for table",
                },
              });
            }

            for (const r of rowsToInsert) {
              if (table === "playlists") this.playlists.push(r);
              if (table === "songs") this.songs.push(r);
              if (table === "playlist_songs") this.playlistSongs.push(r);
            }

            return resolve({ data: rowsToInsert, error: null });
          },
        };

        return insertObj;
      },

      update: (updates: any) => {
        const filters: Array<{ field: string; val: any }> = [];

        const updateObj = {
          eq: (field: string, val: any) => {
            filters.push({ field, val });
            return updateObj;
          },
          then: (resolve: any) => {
            if (this.failUpdate) {
              return resolve({
                data: null,
                error: {
                  code: "PGRST500",
                  message: "Simulated database update failure",
                },
              });
            }

            const targetTable =
              table === "playlists"
                ? this.playlists
                : table === "songs"
                ? this.songs
                : this.playlistSongs;

            for (let i = 0; i < targetTable.length; i++) {
              let match = true;
              for (const f of filters) {
                if ((targetTable[i] as any)[f.field] !== f.val) {
                  match = false;
                  break;
                }
              }
              if (match) {
                targetTable[i] = { ...targetTable[i], ...updates };
              }
            }

            return resolve({ data: updates, error: null });
          },
        };

        return updateObj;
      },

      delete: () => {
        const filters: Array<{ field: string; val: any }> = [];

        const deleteObj = {
          eq: (field: string, val: any) => {
            filters.push({ field, val });
            return deleteObj;
          },
          then: (resolve: any) => {
            if (this.failDelete) {
              return resolve({
                data: null,
                error: {
                  code: "PGRST500",
                  message: "Simulated database delete failure",
                },
              });
            }

            if (table === "playlists") {
              this.playlists = this.playlists.filter((p) => {
                for (const f of filters) {
                  if ((p as any)[f.field] === f.val) return false;
                }
                return true;
              });
            } else if (table === "songs") {
              this.songs = this.songs.filter((s) => {
                for (const f of filters) {
                  if ((s as any)[f.field] === f.val) return false;
                }
                return true;
              });
            } else if (table === "playlist_songs") {
              this.playlistSongs = this.playlistSongs.filter((ps) => {
                for (const f of filters) {
                  if ((ps as any)[f.field] === f.val) return false;
                }
                return true;
              });
            }

            return resolve({ data: null, error: null });
          },
        };

        return deleteObj;
      },

      upsert: (values: any | any[]) => {
        const rows = Array.isArray(values) ? values : [values];

        return {
          then: (resolve: any) => {
            if (this.failInsertRls) {
              return resolve({
                data: null,
                error: { code: "42501", message: "Upsert permission denied" },
              });
            }

            if (table === "playlists") {
              for (const row of rows) {
                const idx = this.playlists.findIndex((p) => p.id === row.id);
                if (idx >= 0) this.playlists[idx] = row;
                else this.playlists.push(row);
              }
            } else if (table === "songs") {
              for (const row of rows) {
                const idx = this.songs.findIndex((s) => s.id === row.id);
                if (idx >= 0) this.songs[idx] = row;
                else this.songs.push(row);
              }
            }

            return resolve({ data: rows, error: null });
          },
        };
      },
    };
  }
}

/**
 * Mock localStorage implementation
 */
class MockLocalStorage implements MinimalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

// ==============================================================================
// PART 3.1: Playlist Persistence & Sync Tests
// ==============================================================================

test("1. Creating a playlist persists a database row in Supabase", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const playlist = await engine.createPlaylist("Focus Beats", "Late night coding");

  assert.equal(playlist.name, "Focus Beats");
  assert.equal(playlist.description, "Late night coding");
  assert.equal(db.playlists.length, 1);
  assert.equal(db.playlists[0]?.id, playlist.id);
  assert.equal(db.playlists[0]?.name, "Focus Beats");
  assert.equal(engine.playlists.length, 1);
});

test("2. Refreshing fetches and displays the playlist from database", async () => {
  const db = new MockSupabaseDatabaseClient();
  const plId = "11111111-2222-3333-4444-555555555555";
  db.playlists.push({
    id: plId,
    name: "Acoustic Chill",
    description: "Relaxing vibes",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const engine = new PlaylistSyncEngine(db);
  await engine.fetchLibrary();

  assert.equal(engine.playlists.length, 1);
  assert.equal(engine.playlists[0]?.id, plId);
  assert.equal(engine.playlists[0]?.name, "Acoustic Chill");
  assert.equal(engine.loadError, null);
  assert.equal(engine.isHydrated, true);
});

test("3. Database insert failure rolls back local state and presents an error (simulated RLS 42501)", async () => {
  const db = new MockSupabaseDatabaseClient();
  db.failInsertRls = true; // Simulate RLS violation
  const engine = new PlaylistSyncEngine(db);

  await assert.rejects(
    async () => {
      await engine.createPlaylist("Failing Playlist");
    },
    (err: Error) => {
      assert.match(err.message, /Database permission denied/i);
      return true;
    }
  );

  // Assert local optimistic state was completely rolled back
  assert.equal(engine.playlists.length, 0);
  assert.equal(Object.keys(engine.playlistSongsMap).length, 0);
  assert.equal(db.playlists.length, 0);
});

test("4. Database select failure does NOT clear existing library state (simulated query failure)", async () => {
  const db = new MockSupabaseDatabaseClient();
  const now = new Date().toISOString();
  const existingSong: Song = {
    id: "song-1",
    title: "Synth Song",
    artist: "Neon Artist",
    audio_url: "https://example.com/synth.mp3",
    source_type: "upload",
    created_at: now,
  };
  const existingPlaylist: Playlist = {
    id: "pl-1",
    name: "Existing Favorites",
    song_count: 1,
    created_at: now,
    updated_at: now,
  };

  const engine = new PlaylistSyncEngine(db, {
    songs: [existingSong],
    playlists: [existingPlaylist],
    map: { "pl-1": ["song-1"] },
  });

  // Simulate select failure (e.g. offline, connection loss, network drop)
  db.failSelect = true;
  await engine.fetchLibrary();

  // In-memory songs and playlists must NOT be wiped out with empty arrays
  assert.equal(engine.songs.length, 1);
  assert.equal(engine.songs[0]?.title, "Synth Song");
  assert.equal(engine.playlists.length, 1);
  assert.equal(engine.playlists[0]?.name, "Existing Favorites");
  assert.match(engine.loadError || "", /Database request failed/);
});

test("5. Renaming updates the database and rolls back on failure", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const playlist = await engine.createPlaylist("Initial Title");
  assert.equal(playlist.name, "Initial Title");

  // Success rename
  await engine.renamePlaylist(playlist.id, "Updated Title");
  assert.equal(engine.playlists[0]?.name, "Updated Title");
  assert.equal(db.playlists[0]?.name, "Updated Title");

  // Failure rename rollback
  db.failUpdate = true;
  await assert.rejects(
    async () => {
      await engine.renamePlaylist(playlist.id, "Broken Title");
    },
    /Failed to rename playlist/
  );

  // Must have rolled back to previous valid name
  assert.equal(engine.playlists[0]?.name, "Updated Title");
});

test("6. Deleting a playlist removes its associations and database row", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const playlist = await engine.createPlaylist("Temporary List");
  await engine.addSongToPlaylist(playlist.id, "song-abc");

  assert.equal(db.playlists.length, 1);
  assert.equal(db.playlistSongs.length, 1);

  // Delete playlist
  await engine.deletePlaylist(playlist.id);

  assert.equal(engine.playlists.length, 0);
  assert.equal(engine.playlistSongsMap[playlist.id], undefined);
  assert.equal(db.playlists.length, 0);
  assert.equal(db.playlistSongs.length, 0);
});

test("7. Adding and removing songs updates associations and song_count", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const playlist = await engine.createPlaylist("Work Session");

  // Add song
  await engine.addSongToPlaylist(playlist.id, "song-101");
  assert.equal(engine.playlistSongsMap[playlist.id]?.length, 1);
  assert.equal(engine.playlists[0]?.song_count, 1);
  assert.equal(db.playlistSongs.length, 1);
  assert.equal(db.playlistSongs[0]?.song_id, "song-101");

  // Add another song
  await engine.addSongToPlaylist(playlist.id, "song-102");
  assert.equal(engine.playlistSongsMap[playlist.id]?.length, 2);
  assert.equal(engine.playlists[0]?.song_count, 2);

  // Remove song
  await engine.removeSongFromPlaylist(playlist.id, "song-101");
  assert.deepEqual(engine.playlistSongsMap[playlist.id], ["song-102"]);
  assert.equal(engine.playlists[0]?.song_count, 1);
});

test("8. Reordering updates positions with atomic rollback on error", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const pl = await engine.createPlaylist("Reorder Test");
  await engine.addSongToPlaylist(pl.id, "track-A");
  await engine.addSongToPlaylist(pl.id, "track-B");
  await engine.addSongToPlaylist(pl.id, "track-C");

  // Successful reorder: B, C, A
  await engine.reorderPlaylistSongs(pl.id, ["track-B", "track-C", "track-A"]);
  assert.deepEqual(engine.playlistSongsMap[pl.id], ["track-B", "track-C", "track-A"]);
  assert.equal(db.playlistSongs[0]?.song_id, "track-B");
  assert.equal(db.playlistSongs[0]?.position, 0);
  assert.equal(db.playlistSongs[1]?.song_id, "track-C");
  assert.equal(db.playlistSongs[1]?.position, 1);
  assert.equal(db.playlistSongs[2]?.song_id, "track-A");
  assert.equal(db.playlistSongs[2]?.position, 2);

  // Failure reorder: should roll back to previous order
  db.failInsertRls = true;
  await assert.rejects(
    async () => {
      await engine.reorderPlaylistSongs(pl.id, ["track-A", "track-B", "track-C"]);
    },
    /Failed to save reordered tracks/
  );

  // Order preserved from before failure
  assert.deepEqual(engine.playlistSongsMap[pl.id], ["track-B", "track-C", "track-A"]);
});

test("9. Deduplication prevents duplicate playlists in local state", async () => {
  const db = new MockSupabaseDatabaseClient();
  const plId = "11111111-1111-1111-1111-111111111111";

  const now = new Date().toISOString();
  // Simulate remote DB or broadcast returning duplicate rows for the same ID
  db.playlists.push({
    id: plId,
    name: "Duplicate Pl",
    created_at: now,
    updated_at: now,
  });
  db.playlists.push({
    id: plId,
    name: "Duplicate Pl (Dupe)",
    created_at: now,
    updated_at: now,
  });

  const engine = new PlaylistSyncEngine(db);
  await engine.fetchLibrary();

  // Deduplication by ID results in exactly 1 playlist
  assert.equal(engine.playlists.length, 1);
  assert.equal(engine.playlists[0]?.id, plId);
});

test("10. Migration from localStorage preserves local data if database migration fails", async () => {
  const db = new MockSupabaseDatabaseClient();
  db.failInsertRls = true; // DB migration will fail
  const storage = new MockLocalStorage();
  const now = new Date().toISOString();

  const localPlaylists: Playlist[] = [
    {
      id: "pl-local-1",
      name: "Unsaved Offline Playlist",
      created_at: now,
      updated_at: now,
    },
  ];
  storage.setItem(LEGACY_STORAGE_KEY_PLAYLISTS, JSON.stringify(localPlaylists));
  storage.setItem(
    LEGACY_STORAGE_KEY_SONGS,
    JSON.stringify([
      {
        id: "s-1",
        title: "Offline Song",
        artist: "Artist",
        source_type: "upload",
        audio_url: "https://example.com/audio.mp3",
        created_at: now,
      },
    ])
  );
  storage.setItem(
    LEGACY_STORAGE_KEY_PLAYLIST_SONGS,
    JSON.stringify({ "pl-local-1": ["s-1"] })
  );

  const engine = new PlaylistSyncEngine(db);
  await engine.fetchLibrary(storage);

  // Since migration failed, localStorage keys MUST NOT be deleted and MIGRATION_DONE_KEY not set
  assert.equal(storage.getItem(MIGRATION_DONE_KEY), null);
  assert.notEqual(storage.getItem(LEGACY_STORAGE_KEY_PLAYLISTS), null);
  assert.notEqual(storage.getItem(LEGACY_STORAGE_KEY_SONGS), null);
  assert.notEqual(storage.getItem(LEGACY_STORAGE_KEY_PLAYLIST_SONGS), null);
});

// ==============================================================================
// PART 3.2: YouTube Extraction & Fallback Tests
// ==============================================================================

test("11. YouTube extraction: Invalid URL returns status 400", () => {
  const res1 = validateYouTubeExtractionInput({
    url: "not-a-youtube-url",
    isStorageConfigured: true,
  });
  assert.equal(res1.valid, false);
  assert.equal(res1.status, 400);
  assert.match(res1.error || "", /Invalid YouTube link/);

  const res2 = validateYouTubeExtractionInput({
    url: "",
    isStorageConfigured: true,
  });
  assert.equal(res2.valid, false);
  assert.equal(res2.status, 400);

  const res3 = validateYouTubeExtractionInput({
    url: "https://spotify.com/track/123",
    isStorageConfigured: true,
  });
  assert.equal(res3.valid, false);
  assert.equal(res3.status, 400);
});

test("12. YouTube extraction: Unavailable video returns status 404", async () => {
  // Mock fetch simulating 404 Not Found from oEmbed
  const mockFetchUnavailable = (async () => {
    return {
      ok: false,
      status: 404,
      json: async () => ({}),
    } as any;
  }) as typeof fetch;

  await assert.rejects(
    async () => {
      await fetchOEmbedMetadata("https://youtube.com/watch?v=missing123", mockFetchUnavailable);
    },
    (err: Error) => {
      const formatted = formatYouTubeError(err);
      assert.equal(formatted.status, 404);
      assert.match(formatted.message, /unavailable, private, or does not exist/);
      return true;
    }
  );
});

test("13. YouTube extraction: Valid metadata inspection works via oEmbed", async () => {
  const mockFetchSuccess = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        title: "Daft Punk - One More Time (Official Audio)",
        author_name: "Daft Punk",
        thumbnail_url: "https://i.ytimg.com/vi/FGBhQbmPwH8/hqdefault.jpg",
      }),
    } as any;
  }) as typeof fetch;

  const meta = await fetchOEmbedMetadata(
    "https://www.youtube.com/watch?v=FGBhQbmPwH8",
    mockFetchSuccess
  );

  assert.equal(meta.title, "Daft Punk - One More Time (Official Audio)");
  assert.equal(meta.artist, "Daft Punk");
  assert.equal(meta.thumbnail, "https://i.ytimg.com/vi/FGBhQbmPwH8/hqdefault.jpg");
});

test("14. YouTube extraction: Missing downloader dependency returns status 501", () => {
  const enoentErr = new Error("spawn yt-dlp ENOENT");
  const formattedEnoent = formatYouTubeError(enoentErr);
  assert.equal(formattedEnoent.status, 501);
  assert.match(formattedEnoent.message, /Audio extraction engine is not available/);

  const ffmpegErr = new Error("ffprobe and ffmpeg not found");
  const formattedFfmpeg = formatYouTubeError(ffmpegErr);
  assert.equal(formattedFfmpeg.status, 501);
  assert.match(formattedFfmpeg.message, /Audio conversion dependency \(ffmpeg\) is not installed/);
});

test("15. YouTube extraction: File size exceeding 50MB returns status 413", () => {
  const overLimitBytes = 52 * 1024 * 1024; // 52 MB
  const result = checkFileSizeLimit(overLimitBytes);

  assert.equal(result.ok, false);
  assert.equal(result.status, 413);
  assert.match(result.error || "", /exceeds the Supabase Free plan limit of 50 MB/);

  const withinLimitBytes = 15 * 1024 * 1024; // 15 MB
  const okResult = checkFileSizeLimit(withinLimitBytes);
  assert.equal(okResult.ok, true);
  assert.equal(okResult.status, 200);
});

test("16. YouTube extraction: Database insertion failure deletes uploaded storage file (rollback)", async () => {
  const deletedPaths: string[] = [];
  const mockDeleteAudioFile = async (path: string) => {
    deletedPaths.push(path);
    return true;
  };

  const orphanedStoragePath = "songs/yt_test_audio.m4a";
  const rolledBack = await rollbackUploadedAudio(orphanedStoragePath, mockDeleteAudioFile);

  assert.equal(rolledBack, true);
  assert.equal(deletedPaths.length, 1);
  assert.equal(deletedPaths[0], orphanedStoragePath);
});

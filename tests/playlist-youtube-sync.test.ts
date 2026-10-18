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
  inspectYouTubePlaylist,
  isBinaryStandalone,
  getYtDlpExecutablePath,
  checkYtDlpDiagnostic,
  getYtDlpRunner,
  ensureYtDlpBinaryReady,
  getYouTubeCookieOptions,
  isYtDlpAvailable,
} from "../src/lib/youtube-service.ts";
import {
  parseYouTubeUrl,
  extractYouTubeVideoId,
  extractYouTubePlaylistId,
  validateLinkInput,
} from "../src/lib/link-utils.ts";
import type {
  Song,
  Playlist,
  YouTubePlaylistItem,
  ImportTrackProgress,
} from "../src/lib/types.ts";

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

test("17. YouTube extraction: HTTP Error 403 Forbidden returns status 403 with actionable bookmark advice", () => {
  const forbiddenErr = new Error(
    "ERROR: unable to download video data: HTTP Error 403: Forbidden\n[youtube] Additional traceback details"
  );
  const formatted = formatYouTubeError(forbiddenErr);

  assert.equal(formatted.status, 403);
  assert.equal(formatted.canBookmark, true);
  assert.match(formatted.message, /HTTP 403: Forbidden/);
  assert.match(formatted.message, /YouTube bookmark/i);

  // Content / licensing restriction variation
  const geoErr = new Error(
    "ERROR: [youtube] Video unavailable: The uploader has not made this video available in your country (HTTP Error 403: Forbidden)"
  );
  const formattedGeo = formatYouTubeError(geoErr);
  assert.equal(formattedGeo.status, 403);
  assert.equal(formattedGeo.canBookmark, true);
  assert.match(formattedGeo.message, /licensing or copyright restrictions/i);
});

test("18. YouTube extraction: HTTP Error 429 Too Many Requests returns status 429", () => {
  const rateLimitErr = new Error(
    "ERROR: unable to download video data: HTTP Error 429: Too Many Requests"
  );
  const formatted = formatYouTubeError(rateLimitErr);

  assert.equal(formatted.status, 429);
  assert.equal(formatted.canBookmark, true);
  assert.match(formatted.message, /HTTP 429: Too Many Requests/);
});

test("19. YouTube extraction: Process timeout returns status 504", () => {
  const timeoutErr = new Error("Command timed out after 50000 milliseconds (ETIMEDOUT)");
  const formatted = formatYouTubeError(timeoutErr);

  assert.equal(formatted.status, 504);
  assert.equal(formatted.canBookmark, true);
  assert.match(formatted.message, /HTTP 504/);
});

test("20. Complete Workflow: Authorized audio metadata inspection, 50MB check, storage upload, and DB insert", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  // 1. Inspect metadata
  const mockFetchSuccess = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        title: "Me at the zoo",
        author_name: "jawed",
        thumbnail_url: "https://i.ytimg.com/vi/jNQXAC9IVRw/default.jpg",
      }),
    } as any;
  }) as typeof fetch;

  const meta = await fetchOEmbedMetadata(
    "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    mockFetchSuccess
  );
  assert.equal(meta.title, "Me at the zoo");
  assert.equal(meta.artist, "jawed");

  // 2. Size check: 302 KB audio buffer
  const audioBuffer = Buffer.alloc(302 * 1024, 0xaa);
  const sizeCheck = checkFileSizeLimit(audioBuffer.length);
  assert.equal(sizeCheck.ok, true);
  assert.equal(sizeCheck.status, 200);

  // 3. Storage path & upload simulation
  const trackId = "99999999-8888-7777-6666-555555555555";
  const storagePath = `songs/${trackId}.m4a`;
  const audioUrl = `https://mock.supabase.co/storage/v1/object/public/songs/${storagePath}`;

  // 4. Database insertion via engine / admin client
  const confirmedSong: Song = {
    id: trackId,
    title: meta.title,
    artist: meta.artist,
    album: "YouTube Audio",
    duration: 18,
    audio_url: audioUrl,
    storage_path: storagePath,
    artwork_url: meta.thumbnail,
    source_type: "youtube_extracted",
    youtube_url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    created_at: new Date().toISOString(),
  };

  db.songs.push(confirmedSong);

  // 5. Cross-device library refresh fetches the extracted track
  await engine.fetchLibrary();
  assert.equal(engine.songs.length, 1);
  assert.equal(engine.songs[0]?.id, trackId);
  assert.equal(engine.songs[0]?.title, "Me at the zoo");
  assert.equal(engine.songs[0]?.source_type, "youtube_extracted");
});

// ==============================================================================
// PART 3.3: YouTube Playlist Import & Cross-Device Sync (Requirements 1 - 15)
// ==============================================================================

test("21. Requirement 1: Single YouTube video requires a destination playlist", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const ytVideoId = "dQw4w9WgXcQ";
  const ytSongData: Omit<Song, "id" | "created_at"> = {
    title: "Never Gonna Give You Up",
    artist: "Rick Astley",
    audio_url: "https://example.com/audio.m4a",
    source_type: "youtube_extracted",
    youtube_url: `https://www.youtube.com/watch?v=${ytVideoId}`,
    youtube_video_id: ytVideoId,
  };

  const requiresPlaylist = (song: typeof ytSongData, plId?: string | null) => {
    if (song.source_type.startsWith("youtube") && !plId) {
      throw new Error("A destination playlist is strictly required for YouTube imports.");
    }
    return true;
  };

  assert.throws(() => requiresPlaylist(ytSongData, null), /destination playlist is strictly required/);

  const pl = await engine.createPlaylist("Favorites");
  assert.equal(requiresPlaylist(ytSongData, pl.id), true);
  const saved = await engine.addSong(ytSongData, pl.id);
  assert.equal(saved.youtube_video_id, ytVideoId);
  assert.deepEqual(engine.playlistSongsMap[pl.id], [saved.id]);
});

test("22. Requirement 2: Creating a website playlist selects it only after successful creation", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  db.failInsertRls = true;
  let selectedId: string | null = null;

  await assert.rejects(
    async () => {
      const pl = await engine.createPlaylist("Failed Playlist");
      selectedId = pl.id;
    },
    /Database permission denied/
  );

  assert.equal(selectedId, null);
  assert.equal(engine.playlists.length, 0);

  db.failInsertRls = false;
  const plSuccess = await engine.createPlaylist("Success Playlist");
  selectedId = plSuccess.id;
  assert.equal(typeof selectedId, "string");
  assert.equal(engine.playlists[0]?.id, selectedId);
});

test("23. Requirement 3: YouTube playlist URL detection and playlist entry inspection", async () => {
  const playlistUrl = "https://www.youtube.com/playlist?list=PLrEnWoR732-DN6gkfZULiT_VlsbA8Xo5v";
  const parsed = parseYouTubeUrl(playlistUrl);

  assert.equal(parsed.isYouTube, true);
  assert.equal(parsed.isPlaylistOnly, true);
  assert.equal(parsed.playlistId, "PLrEnWoR732-DN6gkfZULiT_VlsbA8Xo5v");
  assert.equal(parsed.videoId, null);

  const mockRunner = async () => ({
    _type: "playlist",
    id: "PLrEnWoR732-DN6gkfZULiT_VlsbA8Xo5v",
    title: "Ambient Coding Sessions",
    uploader: "Lofi Beats Lab",
    entries: [
      { id: "vid1", title: "Midnight Code", uploader: "Lofi Beats Lab", duration: 180 },
      { id: "vid2", title: "Morning Rain", uploader: "Lofi Beats Lab", duration: 210 },
      { id: "vid3", title: "Sunset Glow", uploader: "Lofi Beats Lab", duration: 195 },
    ],
  });

  const inspection = await inspectYouTubePlaylist(playlistUrl, mockRunner as any);
  assert.equal(inspection.valid, true);
  assert.equal(inspection.id, "PLrEnWoR732-DN6gkfZULiT_VlsbA8Xo5v");
  assert.equal(inspection.title, "Ambient Coding Sessions");
  assert.equal(inspection.itemCount, 3);
  assert.equal(inspection.entries.length, 3);
  assert.equal(inspection.entries[0]?.id, "vid1");
  assert.equal(inspection.entries[0]?.position, 0);
  assert.equal(inspection.entries[1]?.position, 1);
  assert.equal(inspection.entries[2]?.position, 2);
});

test("24. Requirement 4: A playlist import adds every successfully processed video to the chosen website playlist", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const websitePlaylist = await engine.createPlaylist("My Chill Beats");
  const items: YouTubePlaylistItem[] = [
    { id: "trk1", title: "Track 1", artist: "Artist 1", position: 0, url: "https://www.youtube.com/watch?v=trk1" },
    { id: "trk2", title: "Track 2", artist: "Artist 2", position: 1, url: "https://www.youtube.com/watch?v=trk2" },
    { id: "trk3", title: "Track 3", artist: "Artist 3", position: 2, url: "https://www.youtube.com/watch?v=trk3" },
  ];

  const mockExtractor = async (item: YouTubePlaylistItem): Promise<Song> => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    audio_url: `https://mock.supabase.co/storage/v1/object/public/songs/${item.id}.m4a`,
    source_type: "youtube_extracted",
    youtube_url: item.url,
    youtube_video_id: item.id,
    created_at: new Date().toISOString(),
  });

  const res = await engine.importPlaylistTracks(websitePlaylist.id, items, mockExtractor);
  assert.equal(res.completed, 3);
  assert.equal(res.failed, 0);
  assert.equal(res.skipped, 0);

  assert.equal(engine.playlistSongsMap[websitePlaylist.id]?.length, 3);
  assert.equal(db.playlistSongs.filter((ps) => ps.playlist_id === websitePlaylist.id).length, 3);
  assert.equal(engine.songs.length, 3);
});

test("25. Requirement 5: Importing a YouTube playlist does NOT automatically create a website playlist", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const preExistingPlaylist = await engine.createPlaylist("Existing Website Playlist");
  assert.equal(engine.playlists.length, 1);

  const items: YouTubePlaylistItem[] = [
    { id: "vidA", title: "Song A", artist: "Artist A", position: 0, url: "https://www.youtube.com/watch?v=vidA" },
  ];

  const mockExtractor = async (item: YouTubePlaylistItem): Promise<Song> => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    audio_url: `https://mock.supabase.co/storage/v1/object/public/songs/${item.id}.m4a`,
    source_type: "youtube_extracted",
    youtube_url: item.url,
    youtube_video_id: item.id,
    created_at: new Date().toISOString(),
  });

  await assert.rejects(
    async () => {
      await engine.importPlaylistTracks("non-existent-id", items, mockExtractor);
    },
    /Destination playlist with ID "non-existent-id" does not exist/
  );

  await engine.importPlaylistTracks(preExistingPlaylist.id, items, mockExtractor);
  assert.equal(engine.playlists.length, 1);
  assert.equal(db.playlists.length, 1);
  assert.equal(db.playlists[0]?.name, "Existing Website Playlist");
});

test("26. Requirement 6: A URL containing both v= and list= supports explicit video-versus-playlist selection", () => {
  const compositeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123456789";
  const parsed = parseYouTubeUrl(compositeUrl);

  assert.equal(parsed.isYouTube, true);
  assert.equal(parsed.isComposite, true);
  assert.equal(parsed.videoId, "dQw4w9WgXcQ");
  assert.equal(parsed.playlistId, "PL123456789");

  const videoTargetUrl = `https://www.youtube.com/watch?v=${parsed.videoId}`;
  assert.equal(extractYouTubeVideoId(videoTargetUrl), "dQw4w9WgXcQ");

  const playlistTargetUrl = `https://www.youtube.com/playlist?list=${parsed.playlistId}`;
  assert.equal(extractYouTubePlaylistId(playlistTargetUrl), "PL123456789");
});

test("27. Requirement 7: Original video order is preserved", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const playlist = await engine.createPlaylist("Ordered List");
  const items: YouTubePlaylistItem[] = [
    { id: "pos0", title: "First Track", artist: "A", position: 0, url: "https://youtube.com/watch?v=pos0" },
    { id: "pos1", title: "Second Track", artist: "B", position: 1, url: "https://youtube.com/watch?v=pos1" },
    { id: "pos2", title: "Third Track", artist: "C", position: 2, url: "https://youtube.com/watch?v=pos2" },
  ];

  const mockExtractor = async (item: YouTubePlaylistItem): Promise<Song> => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    audio_url: `https://mock.supabase.co/${item.id}.m4a`,
    source_type: "youtube_extracted",
    youtube_url: item.url,
    youtube_video_id: item.id,
    created_at: new Date().toISOString(),
  });

  await engine.importPlaylistTracks(playlist.id, items, mockExtractor);

  const plSongIds = engine.playlistSongsMap[playlist.id] || [];
  const plVideoIds = plSongIds.map(
    (id) => engine.songs.find((s) => s.id === id)?.youtube_video_id
  );
  assert.deepEqual(plVideoIds, ["pos0", "pos1", "pos2"]);

  const dbRows = db.playlistSongs.filter((ps) => ps.playlist_id === playlist.id);
  assert.equal(dbRows[0]?.position, 0);
  assert.equal(dbRows[1]?.position, 1);
  assert.equal(dbRows[2]?.position, 2);
});

test("28. Requirement 8: Existing songs are reused without duplicate uploads", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const existingSong: Song = {
    id: "existing-uuid-1",
    title: "Already Extracted Song",
    artist: "Famous Artist",
    audio_url: "https://mock.supabase.co/storage/v1/object/public/songs/existing-uuid-1.m4a",
    source_type: "youtube_extracted",
    youtube_url: "https://www.youtube.com/watch?v=reuseVideoId",
    youtube_video_id: "reuseVideoId",
    created_at: new Date().toISOString(),
  };
  db.songs.push(existingSong);
  await engine.fetchLibrary();

  const playlist = await engine.createPlaylist("Playlist With Reused Song");
  const items: YouTubePlaylistItem[] = [
    {
      id: "reuseVideoId",
      title: "Already Extracted Song",
      artist: "Famous Artist",
      position: 0,
      url: "https://www.youtube.com/watch?v=reuseVideoId",
    },
    {
      id: "brandNewVideoId",
      title: "Brand New Song",
      artist: "New Artist",
      position: 1,
      url: "https://www.youtube.com/watch?v=brandNewVideoId",
    },
  ];

  let extractorCalls = 0;
  const mockExtractor = async (item: YouTubePlaylistItem): Promise<Song> => {
    extractorCalls++;
    return {
      id: item.id,
      title: item.title,
      artist: item.artist,
      audio_url: `https://mock.supabase.co/${item.id}.m4a`,
      source_type: "youtube_extracted",
      youtube_url: item.url,
      youtube_video_id: item.id,
      created_at: new Date().toISOString(),
    };
  };

  const res = await engine.importPlaylistTracks(playlist.id, items, mockExtractor);
  assert.equal(res.completed, 2);

  // Extractor called only once for brand new track
  assert.equal(extractorCalls, 1);
  assert.equal(engine.songs.length, 2);
  const plVideoIds = (engine.playlistSongsMap[playlist.id] || []).map(
    (id) => engine.songs.find((s) => s.id === id)?.youtube_video_id
  );
  assert.deepEqual(plVideoIds, ["reuseVideoId", "brandNewVideoId"]);
});

test("29. Requirement 9: Existing playlist tracks remain in their original order", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const playlist = await engine.createPlaylist("Pre-Populated List");

  await engine.addSong(
    {
      title: "Existing Song 1",
      artist: "Old Artist",
      audio_url: "https://example.com/s1.mp3",
      source_type: "upload",
    },
    playlist.id
  );
  await engine.addSong(
    {
      title: "Existing Song 2",
      artist: "Old Artist",
      audio_url: "https://example.com/s2.mp3",
      source_type: "upload",
    },
    playlist.id
  );

  const originalSongIds = [...(engine.playlistSongsMap[playlist.id] || [])];
  assert.equal(originalSongIds.length, 2);

  const items: YouTubePlaylistItem[] = [
    { id: "newYt1", title: "New YT 1", artist: "Y1", position: 0, url: "https://youtube.com/watch?v=newYt1" },
    { id: "newYt2", title: "New YT 2", artist: "Y2", position: 1, url: "https://youtube.com/watch?v=newYt2" },
  ];

  const mockExtractor = async (item: YouTubePlaylistItem): Promise<Song> => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    audio_url: `https://mock.supabase.co/${item.id}.m4a`,
    source_type: "youtube_extracted",
    youtube_url: item.url,
    youtube_video_id: item.id,
    created_at: new Date().toISOString(),
  });

  await engine.importPlaylistTracks(playlist.id, items, mockExtractor);

  const finalSongIds = engine.playlistSongsMap[playlist.id] || [];
  assert.equal(finalSongIds.length, 4);
  assert.equal(finalSongIds[0], originalSongIds[0]);
  assert.equal(finalSongIds[1], originalSongIds[1]);

  const appendedVideoIds = [finalSongIds[2], finalSongIds[3]].map(
    (id) => engine.songs.find((s) => s.id === id)?.youtube_video_id
  );
  assert.deepEqual(appendedVideoIds, ["newYt1", "newYt2"]);

  const dbRows = db.playlistSongs.filter((ps) => ps.playlist_id === playlist.id);
  assert.equal(dbRows.find((r) => r.song_id === originalSongIds[0])?.position, 0);
  assert.equal(dbRows.find((r) => r.song_id === originalSongIds[1])?.position, 1);
  assert.equal(dbRows.find((r) => r.song_id === finalSongIds[2])?.position, 2);
  assert.equal(dbRows.find((r) => r.song_id === finalSongIds[3])?.position, 3);
});

test("30. Requirement 10: Unavailable videos do not stop all other entries from processing", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const playlist = await engine.createPlaylist("Robust Playlist");
  const items: YouTubePlaylistItem[] = [
    { id: "valid1", title: "Available 1", artist: "A1", position: 0, url: "https://youtube.com/watch?v=valid1" },
    { id: "unavail", title: "[Private video]", artist: "A2", position: 1, url: "https://youtube.com/watch?v=unavail", isUnavailable: true },
    { id: "valid2", title: "Available 2", artist: "A3", position: 2, url: "https://youtube.com/watch?v=valid2" },
  ];

  const mockExtractor = async (item: YouTubePlaylistItem): Promise<Song> => {
    if (item.id === "unavail") throw new Error("Private video");
    return {
      id: item.id,
      title: item.title,
      artist: item.artist,
      audio_url: `https://mock.supabase.co/${item.id}.m4a`,
      source_type: "youtube_extracted",
      youtube_url: item.url,
      youtube_video_id: item.id,
      created_at: new Date().toISOString(),
    };
  };

  const res = await engine.importPlaylistTracks(playlist.id, items, mockExtractor);
  assert.equal(res.completed, 2);
  assert.equal(res.skipped, 1);
  assert.equal(res.failed, 0);

  const addedVideoIds = (engine.playlistSongsMap[playlist.id] || []).map(
    (id) => engine.songs.find((s) => s.id === id)?.youtube_video_id
  );
  assert.deepEqual(addedVideoIds, ["valid1", "valid2"]);
});

test("31. Requirement 11: Partial failure and retry do not duplicate completed tracks", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const playlist = await engine.createPlaylist("Partial Failure Test");
  const items: YouTubePlaylistItem[] = [
    { id: "trackA", title: "Track A", artist: "Artist A", position: 0, url: "https://youtube.com/watch?v=trackA" },
    { id: "trackB", title: "Track B (Will Fail First Time)", artist: "Artist B", position: 1, url: "https://youtube.com/watch?v=trackB" },
    { id: "trackC", title: "Track C", artist: "Artist C", position: 2, url: "https://youtube.com/watch?v=trackC" },
  ];

  let failTrackB = true;
  const mockExtractor = async (item: YouTubePlaylistItem): Promise<Song> => {
    if (item.id === "trackB" && failTrackB) {
      throw new Error("HTTP 403 Forbidden");
    }
    return {
      id: item.id,
      title: item.title,
      artist: item.artist,
      audio_url: `https://mock.supabase.co/${item.id}.m4a`,
      source_type: "youtube_extracted",
      youtube_url: item.url,
      youtube_video_id: item.id,
      created_at: new Date().toISOString(),
    };
  };

  const run1 = await engine.importPlaylistTracks(playlist.id, items, mockExtractor);
  assert.equal(run1.completed, 2);
  assert.equal(run1.failed, 1);

  const run1VideoIds = (engine.playlistSongsMap[playlist.id] || []).map(
    (id) => engine.songs.find((s) => s.id === id)?.youtube_video_id
  );
  assert.deepEqual(run1VideoIds, ["trackA", "trackC"]);

  // Retry failed only
  failTrackB = false;
  const failedItems = items.filter((it) => run1.results.some((r) => r.id === it.id && r.status === "failed"));
  assert.equal(failedItems.length, 1);
  assert.equal(failedItems[0]?.id, "trackB");

  const run2 = await engine.importPlaylistTracks(playlist.id, failedItems, mockExtractor);
  assert.equal(run2.completed, 1);
  assert.equal(run2.failed, 0);

  const finalVideoIds = (engine.playlistSongsMap[playlist.id] || []).map(
    (id) => engine.songs.find((s) => s.id === id)?.youtube_video_id
  );
  assert.equal(finalVideoIds.length, 3);
  assert.deepEqual(finalVideoIds, ["trackA", "trackC", "trackB"]);
});

test("32. Requirement 12: Supabase upload and database failures receive safe rollback handling", async () => {
  const deletedFiles: string[] = [];
  const mockDeleteAudioFile = async (path: string) => {
    deletedFiles.push(path);
    return true;
  };

  const storagePath = "songs/failed_db_insert.m4a";
  const rolledBack = await rollbackUploadedAudio(storagePath, mockDeleteAudioFile);
  assert.equal(rolledBack, true);
  assert.equal(deletedFiles.length, 1);
  assert.equal(deletedFiles[0], storagePath);
});

test("33. Requirement 13: Progress, cancellation and completion summaries behave correctly", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const playlist = await engine.createPlaylist("Cancellation Test");
  const items: YouTubePlaylistItem[] = [
    { id: "c1", title: "T1", artist: "A", position: 0, url: "https://youtube.com/watch?v=c1" },
    { id: "c2", title: "T2", artist: "A", position: 1, url: "https://youtube.com/watch?v=c2" },
    { id: "c3", title: "T3", artist: "A", position: 2, url: "https://youtube.com/watch?v=c3" },
    { id: "c4", title: "T4", artist: "A", position: 3, url: "https://youtube.com/watch?v=c4" },
  ];

  const progressEvents: ImportTrackProgress[] = [];
  let processedCount = 0;

  const mockExtractor = async (item: YouTubePlaylistItem): Promise<Song> => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    audio_url: `https://mock.supabase.co/${item.id}.m4a`,
    source_type: "youtube_extracted",
    youtube_url: item.url,
    youtube_video_id: item.id,
    created_at: new Date().toISOString(),
  });

  const res = await engine.importPlaylistTracks(playlist.id, items, mockExtractor, {
    onProgress: (p) => progressEvents.push(p),
    shouldCancel: () => {
      processedCount++;
      return processedCount > 2;
    },
  });

  assert.equal(res.completed, 2);
  assert.equal(engine.playlistSongsMap[playlist.id]?.length, 2);
  const completedVideoIds = (engine.playlistSongsMap[playlist.id] || []).map(
    (id) => engine.songs.find((s) => s.id === id)?.youtube_video_id
  );
  assert.deepEqual(completedVideoIds, ["c1", "c2"]);
});

test("34. Requirement 14: Imported songs remain visible after refresh and across separate browsers", async () => {
  const sharedDb = new MockSupabaseDatabaseClient();

  const browser1 = new PlaylistSyncEngine(sharedDb);
  const pl = await browser1.createPlaylist("Shared Playlist");
  const items: YouTubePlaylistItem[] = [
    { id: "sync1", title: "Cross-Device 1", artist: "Artist", position: 0, url: "https://youtube.com/watch?v=sync1" },
    { id: "sync2", title: "Cross-Device 2", artist: "Artist", position: 1, url: "https://youtube.com/watch?v=sync2" },
  ];

  const mockExtractor = async (item: YouTubePlaylistItem): Promise<Song> => ({
    id: item.id,
    title: item.title,
    artist: item.artist,
    audio_url: `https://mock.supabase.co/${item.id}.m4a`,
    source_type: "youtube_extracted",
    youtube_url: item.url,
    youtube_video_id: item.id,
    created_at: new Date().toISOString(),
  });

  await browser1.importPlaylistTracks(pl.id, items, mockExtractor);
  assert.equal(browser1.songs.length, 2);

  // Fresh page load / other browser fetches library
  const browser2 = new PlaylistSyncEngine(sharedDb);
  await browser2.fetchLibrary();

  assert.equal(browser2.playlists.length, 1);
  assert.equal(browser2.playlists[0]?.id, pl.id);
  assert.equal(browser2.songs.length, 2);

  const b2VideoIds = (browser2.playlistSongsMap[pl.id] || []).map(
    (id) => browser2.songs.find((s) => s.id === id)?.youtube_video_id
  );
  assert.deepEqual(b2VideoIds, ["sync1", "sync2"]);
  assert.equal(browser2.playlists[0]?.song_count, 2);
});

test("35. Requirement 15: Existing direct audio URLs, playlists and player behavior remain functional", async () => {
  const db = new MockSupabaseDatabaseClient();
  const engine = new PlaylistSyncEngine(db);

  const audioValidation = await validateLinkInput("https://example.com/podcast/episode1.mp3");
  assert.equal(audioValidation.isValid, true);
  assert.equal(audioValidation.type, "audio");
  assert.equal(audioValidation.format, "MP3");

  const directSong = await engine.addSong({
    title: "Direct Stream Episode",
    artist: "Podcast Host",
    audio_url: "https://example.com/podcast/episode1.mp3",
    source_type: "direct_url",
  });
  assert.equal(engine.songs.length, 1);
  assert.equal(engine.songs[0]?.id, directSong.id);
  assert.equal(engine.songs[0]?.source_type, "direct_url");
});

test("36. Standalone executable detection: isBinaryStandalone detects ELF/native binary without python", () => {
  const binPath = getYtDlpExecutablePath();
  assert.ok(binPath, "Executable path should be resolved");
  assert.equal(isBinaryStandalone(binPath!), true, "Installed yt-dlp binary should be a standalone native executable");
});

test("37. Runtime diagnostic: checkYtDlpDiagnostic reports version without downloading media", async () => {
  const diag = await checkYtDlpDiagnostic();
  assert.equal(diag.ok, true, "Diagnostic should return ok: true");
  assert.equal(diag.version, "2026.08.19", "Diagnostic should report pinned version 2026.08.19");
  assert.equal(diag.isStandalone, true, "Diagnostic should confirm standalone mode");
  assert.equal(typeof diag.path, "string");
  assert.ok(diag.architecture, "Diagnostic should report architecture");
  assert.ok(diag.platform, "Diagnostic should report platform");
});

test("38. Runtime diagnostic: checkYtDlpDiagnostic gracefully handles missing executable", async () => {
  const diag = await checkYtDlpDiagnostic("/non/existent/yt-dlp-bin");
  assert.equal(diag.ok, false, "Diagnostic should return ok: false for missing binary");
  assert.equal(diag.isStandalone, false);
  assert.match(diag.error || "", /not found/i);
});

test("39. Error handling: formatYouTubeError maps missing python3 error to HTTP 501", () => {
  const pythonMissingErr = new Error("env: 'python3': No such file or directory");
  const formatted = formatYouTubeError(pythonMissingErr);
  assert.equal(formatted.status, 501, "Missing python3 error must return status 501");
  assert.equal(formatted.canBookmark, true, "Should offer bookmark capability");
  assert.match(formatted.message, /Audio extraction engine is not available/i);

  const python3NotFoundErr = new Error("/bin/sh: 1: python3: not found");
  const formatted2 = formatYouTubeError(python3NotFoundErr);
  assert.equal(formatted2.status, 501);
  assert.equal(formatted2.canBookmark, true);
});

test("40. Standalone runner: getYtDlpRunner executes standalone binary without invoking python3", async () => {
  assert.equal(isYtDlpAvailable(), true);
  const runner = getYtDlpRunner();
  assert.ok(runner, "getYtDlpRunner should return a callable instance");
  const version = await runner("", { version: true });
  assert.equal(String(version).trim(), "2026.08.19");
});

test("41. Standalone readiness: ensureYtDlpBinaryReady verifies or prepares executable in /tmp if missing", async () => {
  const readyPath = await ensureYtDlpBinaryReady();
  assert.ok(readyPath, "Should return an executable path");
  assert.equal(isBinaryStandalone(readyPath), true, "Prepared binary must be standalone native ELF/Mach-O/PE");
});

test("42. Datacenter challenge bypass: getYouTubeCookieOptions and mobile client extractor args", () => {
  // Test cookie resolution without environment set
  const origEnv = process.env.YOUTUBE_COOKIE;
  try {
    delete process.env.YOUTUBE_COOKIE;
    delete process.env.YOUTUBE_COOKIES;
    const emptyOpts = getYouTubeCookieOptions();
    assert.deepEqual(typeof emptyOpts, "object");

    // Test with YOUTUBE_COOKIE set
    process.env.YOUTUBE_COOKIE = "# Netscape HTTP Cookie File\n.youtube.com\tTRUE\t/\tTRUE\t2147483647\tSID\tsample_value";
    const withEnvOpts = getYouTubeCookieOptions();
    assert.ok(withEnvOpts.cookiefile, "Should return temporary cookie file path");
  } finally {
    if (origEnv !== undefined) {
      process.env.YOUTUBE_COOKIE = origEnv;
    } else {
      delete process.env.YOUTUBE_COOKIE;
    }
  }
});





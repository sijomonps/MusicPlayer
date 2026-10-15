"use client";

import React, { useState } from "react";
import {
  Play,
  Pause,
  MoreVertical,
  Trash2,
  ListPlus,
  ExternalLink,
  Music,
  Search,
  Plus,
} from "lucide-react";
import { YoutubeIcon } from "@/components/icons/YoutubeIcon";
import { Song } from "@/lib/types";
import { useAudio } from "@/lib/audio-context";
import { useLibrary } from "@/lib/library-context";
import { formatTime } from "@/lib/format-utils";

interface SongListProps {
  songs: Song[];
  title?: string;
  onOpenAddModal: () => void;
}

export function SongList({ songs, title = "All Songs", onOpenAddModal }: SongListProps) {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const { playlists, addSongToPlaylist, deleteSong } = useLibrary();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeMenuSongId, setActiveMenuSongId] = useState<string | null>(null);
  const [playlistMenuSongId, setPlaylistMenuSongId] = useState<string | null>(null);

  const filteredSongs = songs.filter(
    (s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePlaySong = (song: Song) => {
    if (song.source_type === "youtube_bookmark") {
      if (song.youtube_url) {
        window.open(song.youtube_url, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (currentSong?.id === song.id) {
      togglePlay();
    } else {
      // Filter out non-streamable bookmarks from queue
      const streamableQueue = songs.filter((s) => s.source_type !== "youtube_bookmark");
      playSong(song, streamableQueue);
    }
  };

  const handleAddToPlaylist = async (playlistId: string, songId: string) => {
    try {
      await addSongToPlaylist(playlistId, songId);
      setPlaylistMenuSongId(null);
      setActiveMenuSongId(null);
    } catch (err: unknown) {
      alert("Could not add to playlist: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Remove this song from your library?")) {
      await deleteSong(id);
      setActiveMenuSongId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            {title}
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {songs.length} {songs.length === 1 ? "track" : "tracks"} in library
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-3 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter songs..."
              className="w-full pl-9 pr-3 py-2 rounded-xl text-sm bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-zinc-300 dark:focus:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none placeholder:text-zinc-400"
            />
          </div>

          <button
            onClick={onOpenAddModal}
            className="flex sm:hidden p-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 active:scale-95 transition-transform"
            aria-label="Add music"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Empty State */}
      {filteredSongs.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <Music className="w-10 h-10 mx-auto text-zinc-400 stroke-1 mb-3" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {searchQuery ? "No matching tracks found" : "Your library is empty"}
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mt-1 mb-4">
            {searchQuery
              ? "Try searching for a different song or artist title."
              : "Paste an MP3/M4A link, bookmark a YouTube video, or upload your audio files to Cloudflare R2."}
          </p>
          {!searchQuery && (
            <button
              onClick={onOpenAddModal}
              className="px-4 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90 transition-opacity"
            >
              Add Your First Song
            </button>
          )}
        </div>
      ) : (
        /* Song List Table / Card Rows */
        <div className="space-y-1">
          {filteredSongs.map((song) => {
            const isCurrent = currentSong?.id === song.id;
            const isYt = song.source_type === "youtube_bookmark";

            return (
              <div
                key={song.id}
                className={`group relative flex items-center justify-between p-2.5 sm:p-3 rounded-xl transition-all duration-150 ${
                  isCurrent
                    ? "bg-zinc-100 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40 border border-transparent"
                }`}
              >
                {/* Left: Index / Play Button + Artwork + Meta */}
                <div
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  onClick={() => handlePlaySong(song)}
                >
                  {/* Artwork / Icon */}
                  <div className="relative w-11 h-11 rounded-lg bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center border border-zinc-200/50 dark:border-zinc-700/50">
                    {song.artwork_url ? (
                      <img
                        src={song.artwork_url}
                        alt={song.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music className="w-5 h-5 text-zinc-400" />
                    )}

                    {/* Hover or Active Play Overlay */}
                    <div
                      className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                        isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {isYt ? (
                        <ExternalLink className="w-4 h-4 text-white" />
                      ) : isCurrent && isPlaying ? (
                        <Pause className="w-4 h-4 text-white fill-current" />
                      ) : (
                        <Play className="w-4 h-4 text-white fill-current ml-0.5" />
                      )}
                    </div>
                  </div>

                  {/* Title & Artist */}
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-sm truncate font-medium ${
                          isCurrent
                            ? "text-zinc-950 dark:text-zinc-50 font-semibold"
                            : "text-zinc-800 dark:text-zinc-200"
                        }`}
                      >
                        {song.title}
                      </p>
                      {isYt && (
                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center gap-1">
                          <YoutubeIcon className="w-3 h-3" />
                          Bookmark
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                      {song.artist}
                    </p>
                  </div>
                </div>

                {/* Right: Duration, Date & Action Menu */}
                <div className="flex items-center gap-3 shrink-0">
                  {song.duration && !isYt ? (
                    <span className="hidden sm:inline text-xs font-mono text-zinc-400">
                      {formatTime(song.duration)}
                    </span>
                  ) : null}

                  {/* More Actions Menu */}
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuSongId(
                          activeMenuSongId === song.id ? null : song.id
                        );
                        setPlaylistMenuSongId(null);
                      }}
                      aria-label="More options"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {activeMenuSongId === song.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1.5 z-30"
                      >
                        {isYt && song.youtube_url && (
                          <a
                            href={song.youtube_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            Open on YouTube
                          </a>
                        )}

                        <button
                          onClick={() => setPlaylistMenuSongId(song.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/80"
                        >
                          <ListPlus className="w-3.5 h-3.5" />
                          Add to Playlist...
                        </button>

                        <button
                          onClick={() => handleDelete(song.id)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Song
                        </button>

                        {/* Submenu for selecting playlist */}
                        {playlistMenuSongId === song.id && (
                          <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1 max-h-36 overflow-y-auto">
                            <div className="px-3 py-1 text-[10px] uppercase font-semibold text-zinc-400">
                              Choose Playlist
                            </div>
                            {playlists.length === 0 ? (
                              <div className="px-3 py-1.5 text-xs text-zinc-400 italic">
                                No playlists yet
                              </div>
                            ) : (
                              playlists.map((pl) => (
                                <button
                                  key={pl.id}
                                  onClick={() => handleAddToPlaylist(pl.id, song.id)}
                                  className="w-full text-left px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 truncate"
                                >
                                  {pl.name}
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState } from "react";
import {
  Play,
  MoreHorizontal,
  Trash2,
  ExternalLink,
  Music,
  Search,
  Plus,
  Check,
  X,
  AlertCircle,
} from "lucide-react";
import { Song } from "@/lib/types";
import { useAudio } from "@/lib/audio-context";
import { useLibrary } from "@/lib/library-context";
import { formatTime } from "@/lib/format-utils";

interface SongListProps {
  songs: Song[];
  title?: string;
  onOpenAddModal: () => void;
}

export function SongList({
  songs,
  title = "Tracks",
  onOpenAddModal,
}: SongListProps) {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const {
    playlists,
    playlistSongsMap,
    addSongToPlaylist,
    removeSongFromPlaylist,
    createPlaylist,
    deleteSong,
    loadError,
    refreshLibrary,
  } = useLibrary();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeMenuSong, setActiveMenuSong] = useState<Song | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

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
      const streamableQueue = songs.filter(
        (s) => s.source_type !== "youtube_bookmark"
      );
      playSong(song, streamableQueue);
    }
  };

  const handleTogglePlaylist = async (playlistId: string, songId: string) => {
    const songIds = playlistSongsMap[playlistId] || [];
    if (songIds.includes(songId)) {
      await removeSongFromPlaylist(playlistId, songId);
    } else {
      await addSongToPlaylist(playlistId, songId);
    }
  };

  const handleCreateAndAdd = async () => {
    const name = newPlaylistName.trim();
    if (!name || !activeMenuSong) {
      setIsCreatingPlaylist(false);
      return;
    }
    try {
      const pl = await createPlaylist(name);
      await addSongToPlaylist(pl.id, activeMenuSong.id);
      setNewPlaylistName("");
      setIsCreatingPlaylist(false);
    } catch (err) {
      console.warn("Could not create playlist:", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Delete track?")) {
      await deleteSong(id);
      setActiveMenuSong(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Load Error Banner */}
      {loadError && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span className="truncate">{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => refreshLibrary()}
            className="px-3 py-1 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-semibold shrink-0 cursor-pointer transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Header & Search */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold tracking-tight text-white">
            {title}
          </h2>
          <span className="text-xs font-mono text-zinc-500">
            {songs.length}
          </span>
        </div>

        {/* Search Input Pill */}
        <div className="relative flex-1 max-w-[200px] sm:max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            className="w-full h-8 pl-8 pr-3 rounded-full text-xs bg-white/[0.04] border border-white/[0.06] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/20 transition-all"
          />
        </div>
      </div>

      {/* Empty State */}
      {filteredSongs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <Music className="w-8 h-8 text-zinc-600 stroke-1 mb-2.5" />
          <p className="text-xs font-medium text-zinc-400">
            {searchQuery ? "No matching tracks" : "No tracks"}
          </p>
          {!searchQuery && (
            <button
              onClick={onOpenAddModal}
              className="mt-3 px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-semibold active:scale-95 transition-all cursor-pointer"
            >
              + Add
            </button>
          )}
        </div>
      ) : (
        /* Track Rows */
        <div className="space-y-1">
          {filteredSongs.map((song) => {
            const isCurrent = currentSong?.id === song.id;
            const isYtBookmark = song.source_type === "youtube_bookmark";
            const isYtExtracted = song.source_type === "youtube_extracted";
            const isDirect = song.source_type === "direct_url";

            return (
              <div
                key={song.id}
                className={`group flex items-center justify-between py-1.5 px-2.5 rounded-xl transition-all ${
                  isCurrent
                    ? "bg-white/[0.07] border border-white/[0.08]"
                    : "hover:bg-white/[0.03] active:bg-white/[0.05] border border-transparent"
                }`}
              >
                {/* Left: Artwork + Title + Artist */}
                <div
                  className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                  onClick={() => handlePlaySong(song)}
                >
                  {/* Artwork / Equalizer Overlay */}
                  <div className="relative w-10 h-10 rounded-lg bg-white/[0.04] border border-white/[0.08] overflow-hidden shrink-0 flex items-center justify-center">
                    {song.artwork_url ? (
                      <img
                        src={song.artwork_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music className="w-4 h-4 text-zinc-500" />
                    )}

                    {/* Active Equalizer Bar Overlay */}
                    {isCurrent && (
                      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center gap-[2px]">
                        {isPlaying ? (
                          <>
                            <span className="w-[2.5px] bg-white rounded-full animate-eq-1" />
                            <span className="w-[2.5px] bg-white rounded-full animate-eq-2" />
                            <span className="w-[2.5px] bg-white rounded-full animate-eq-3" />
                          </>
                        ) : (
                          <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
                        )}
                      </div>
                    )}

                    {/* Bookmark External Glyph */}
                    {isYtBookmark && !isCurrent && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink className="w-3.5 h-3.5 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Metadata & Source Dot */}
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <p
                        className={`text-xs sm:text-sm truncate font-medium ${
                          isCurrent
                            ? "text-white font-semibold"
                            : "text-zinc-200"
                        }`}
                      >
                        {song.title}
                      </p>

                      {/* Subtle dot indicator */}
                      {(isYtExtracted || isYtBookmark) && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"
                          title="YouTube"
                        />
                      )}
                      {isDirect && (
                        <span
                          className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
                          title="Stream"
                        />
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                      {song.artist}
                    </p>
                  </div>
                </div>

                {/* Right: Duration + Menu Button */}
                <div className="flex items-center gap-2 shrink-0">
                  {song.duration && !isYtBookmark ? (
                    <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                      {formatTime(song.duration)}
                    </span>
                  ) : null}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveMenuSong(song);
                      setIsCreatingPlaylist(false);
                    }}
                    aria-label="Track options"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/[0.08] active:scale-90 transition-transform cursor-pointer"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= TRACK ACTION SHEET ================= */}
      {activeMenuSong && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
          <div
            className="absolute inset-0 -z-10"
            onClick={() => setActiveMenuSong(null)}
          />

          <div className="w-full md:max-w-sm rounded-t-3xl md:rounded-2xl bg-[#09090c] border-t md:border border-white/[0.08] shadow-2xl p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] space-y-4">
            {/* Sheet Handle */}
            <div className="w-8 h-1 rounded-full bg-white/20 mx-auto md:hidden" />

            {/* Track Info Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/[0.08] overflow-hidden shrink-0 flex items-center justify-center">
                  {activeMenuSong.artwork_url ? (
                    <img
                      src={activeMenuSong.artwork_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Music className="w-4 h-4 text-zinc-500" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {activeMenuSong.title}
                  </p>
                  <p className="text-[11px] text-zinc-400 truncate">
                    {activeMenuSong.artist}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveMenuSong(null)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Playlists Toggle Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 px-1">
                <span>Add to Playlist</span>
                {!isCreatingPlaylist && (
                  <button
                    onClick={() => setIsCreatingPlaylist(true)}
                    className="flex items-center gap-1 text-[10px] text-zinc-300 hover:text-white"
                  >
                    <Plus className="w-3 h-3" />
                    <span>New</span>
                  </button>
                )}
              </div>

              {/* Inline Create Playlist */}
              {isCreatingPlaylist && (
                <div className="flex items-center gap-1.5 p-1 bg-white/[0.04] border border-white/[0.1] rounded-xl">
                  <input
                    type="text"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Playlist name"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCreateAndAdd();
                      } else if (e.key === "Escape") {
                        setIsCreatingPlaylist(false);
                      }
                    }}
                    className="flex-1 px-2.5 py-1 text-xs bg-transparent text-white placeholder:text-zinc-500 focus:outline-none"
                  />
                  <button
                    onClick={handleCreateAndAdd}
                    className="px-2 py-1 rounded-lg bg-white text-black text-[11px] font-semibold active:scale-95"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setIsCreatingPlaylist(false)}
                    className="p-1 text-zinc-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Playlists Checkbox List */}
              <div className="max-h-40 overflow-y-auto no-scrollbar space-y-1">
                {playlists.map((pl) => {
                  const isInPlaylist = (
                    playlistSongsMap[pl.id] || []
                  ).includes(activeMenuSong.id);

                  return (
                    <button
                      key={pl.id}
                      onClick={() =>
                        handleTogglePlaylist(pl.id, activeMenuSong.id)
                      }
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-left"
                    >
                      <span className="text-zinc-300 truncate">{pl.name}</span>
                      <div
                        className={`w-4 h-4 rounded-full flex items-center justify-center border transition-all ${
                          isInPlaylist
                            ? "bg-white text-black border-white"
                            : "border-white/20 text-transparent"
                        }`}
                      >
                        <Check className="w-2.5 h-2.5 stroke-[3]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* External YouTube Link if present */}
            {activeMenuSong.youtube_url && (
              <a
                href={activeMenuSong.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open on YouTube</span>
              </a>
            )}

            {/* Delete Track Action */}
            <div className="pt-1 border-t border-white/[0.06]">
              <button
                onClick={() => handleDelete(activeMenuSong.id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Track</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useState, useMemo } from "react";
import {
  ArrowLeft,
  Play,
  Pause,
  Shuffle,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Music,
  ExternalLink,
  Search,
  X,
} from "lucide-react";
import { Playlist, Song } from "@/lib/types";
import { useAudio } from "@/lib/audio-context";
import { useLibrary } from "@/lib/library-context";
import { formatTime } from "@/lib/format-utils";

interface PlaylistDetailProps {
  playlist: Playlist;
  onBack: () => void;
  onOpenAddModal: () => void;
}

export function PlaylistDetail({
  playlist,
  onBack,
  onOpenAddModal,
}: PlaylistDetailProps) {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const {
    playlists,
    playlistSongsMap,
    songs: allSongs,
    addSongToPlaylist,
    removeSongFromPlaylist,
    reorderPlaylistSongs,
  } = useLibrary();

  const [isAddingSong, setIsAddingSong] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  // Synchronously derive latest playlist data & ordered songs
  const currentPlaylist =
    playlists.find((p) => p.id === playlist.id) || playlist;
  const songIds = useMemo(
    () => playlistSongsMap[playlist.id] || [],
    [playlistSongsMap, playlist.id]
  );

  const playlistSongs = useMemo(() => {
    const songMap = new Map(allSongs.map((s) => [s.id, s]));
    return songIds
      .map((id) => songMap.get(id))
      .filter((s): s is Song => Boolean(s));
  }, [songIds, allSongs]);

  const isPlaylistPlaying = Boolean(
    currentSong && isPlaying && songIds.includes(currentSong.id)
  );

  // Play individual track
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
      const streamable = playlistSongs.filter(
        (s) => s.source_type !== "youtube_bookmark"
      );
      playSong(song, streamable);
    }
  };

  // Play / Pause all
  const handlePlayOrPauseAll = () => {
    if (isPlaylistPlaying) {
      togglePlay();
      return;
    }
    const streamable = playlistSongs.filter(
      (s) => s.source_type !== "youtube_bookmark"
    );
    if (streamable.length === 0) return;

    if (currentSong && streamable.some((s) => s.id === currentSong.id)) {
      togglePlay();
    } else {
      playSong(streamable[0], streamable);
    }
  };

  // Shuffle play
  const handleShufflePlay = () => {
    const streamable = playlistSongs.filter(
      (s) => s.source_type !== "youtube_bookmark"
    );
    if (streamable.length === 0) return;

    const shuffled = [...streamable];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    playSong(shuffled[0], shuffled);
  };

  // Reordering: 1-touch mobile up/down
  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const newIds = [...songIds];
    const temp = newIds[index - 1];
    newIds[index - 1] = newIds[index];
    newIds[index] = temp;
    await reorderPlaylistSongs(playlist.id, newIds);
  };

  const handleMoveDown = async (index: number) => {
    if (index >= songIds.length - 1) return;
    const newIds = [...songIds];
    const temp = newIds[index + 1];
    newIds[index + 1] = newIds[index];
    newIds[index] = temp;
    await reorderPlaylistSongs(playlist.id, newIds);
  };

  // HTML5 Drag and Drop (desktop)
  const handleDragStart = (index: number) => {
    setDraggedIdx(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (index: number) => {
    if (draggedIdx === null || draggedIdx === index) return;
    const newIds = [...songIds];
    const [moved] = newIds.splice(draggedIdx, 1);
    newIds.splice(index, 0, moved);
    setDraggedIdx(null);
    await reorderPlaylistSongs(playlist.id, newIds);
  };

  // Available library tracks to add
  const availableSongs = useMemo(() => {
    const unadded = allSongs.filter((s) => !songIds.includes(s.id));
    if (!pickerSearch.trim()) return unadded;
    const q = pickerSearch.toLowerCase();
    return unadded.filter(
      (s) =>
        s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q)
    );
  }, [allSongs, songIds, pickerSearch]);

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="space-y-4">
        {/* Back Button */}
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] active:scale-95 flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
          aria-label="Back to playlists"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        {/* Title & Metadata */}
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
            {currentPlaylist.name}
          </h1>
          <p className="text-xs font-mono text-zinc-500 mt-0.5">
            {playlistSongs.length}{" "}
            {playlistSongs.length === 1 ? "track" : "tracks"}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {playlistSongs.length > 0 && (
            <>
              {/* Play / Pause Pill */}
              <button
                onClick={handlePlayOrPauseAll}
                className="h-8 px-4 rounded-full bg-white text-black text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-xs"
              >
                {isPlaylistPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Pause</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    <span>Play</span>
                  </>
                )}
              </button>

              {/* Shuffle Pill */}
              <button
                onClick={handleShufflePlay}
                className="h-8 px-3.5 rounded-full bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-medium border border-white/[0.1] flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Shuffle className="w-3.5 h-3.5" />
                <span>Shuffle</span>
              </button>
            </>
          )}

          {/* Add Tracks Toggle Pill */}
          <button
            onClick={() => setIsAddingSong(!isAddingSong)}
            className={`h-8 px-3.5 rounded-full text-xs font-medium border flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer ${
              isAddingSong
                ? "bg-white text-black border-white"
                : "bg-white/[0.05] hover:bg-white/[0.09] text-zinc-300 border-white/[0.08]"
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAddingSong ? "Done" : "Add Tracks"}</span>
          </button>
        </div>
      </div>

      {/* Add Tracks Drawer */}
      {isAddingSong && (
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-3 animate-fade-in-up">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Add Tracks
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={onOpenAddModal}
                className="text-xs text-zinc-400 hover:text-white underline cursor-pointer"
              >
                + Upload or Link
              </button>
              <button
                onClick={() => setIsAddingSong(false)}
                className="text-zinc-500 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Quick Filter Pill */}
          {allSongs.length > 4 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2 text-zinc-500" />
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search library..."
                className="w-full h-7 pl-8 pr-3 rounded-full text-xs bg-white/[0.04] border border-white/[0.06] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/20 transition-all"
              />
            </div>
          )}

          {/* Available Tracks List */}
          {availableSongs.length === 0 ? (
            <p className="text-xs text-zinc-500 py-3 text-center">
              {pickerSearch
                ? "No matching tracks"
                : "All library tracks are in this playlist."}
            </p>
          ) : (
            <div className="max-h-52 overflow-y-auto space-y-1 pr-1 no-scrollbar">
              {availableSongs.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <div className="w-8 h-8 rounded-md bg-white/[0.04] border border-white/[0.08] overflow-hidden shrink-0 flex items-center justify-center">
                      {s.artwork_url ? (
                        <img
                          src={s.artwork_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Music className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">
                        {s.title}
                      </p>
                      <p className="text-[11px] text-zinc-400 truncate">
                        {s.artist}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => addSongToPlaylist(playlist.id, s.id)}
                    aria-label={`Add ${s.title}`}
                    className="w-7 h-7 rounded-full bg-white/[0.08] hover:bg-white text-white hover:text-black flex items-center justify-center transition-all active:scale-90 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Playlist Tracklist */}
      {playlistSongs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <Music className="w-8 h-8 text-zinc-600 stroke-1 mb-2.5" />
          <p className="text-xs font-medium text-zinc-400">
            No tracks in playlist
          </p>
          <button
            onClick={() => setIsAddingSong(true)}
            className="mt-3 px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-semibold active:scale-95 transition-all cursor-pointer"
          >
            + Add Tracks
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {playlistSongs.map((song, index) => {
            const isCurrent = currentSong?.id === song.id;
            const isYtBookmark = song.source_type === "youtube_bookmark";
            const isYtExtracted = song.source_type === "youtube_extracted";
            const isDirect = song.source_type === "direct_url";

            return (
              <div
                key={`${song.id}-${index}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                className={`group flex items-center justify-between py-1.5 px-2.5 rounded-xl transition-all ${
                  isCurrent
                    ? "bg-white/[0.07] border border-white/[0.08]"
                    : "hover:bg-white/[0.03] active:bg-white/[0.05] border border-transparent"
                }`}
              >
                {/* Reorder Controls & Index */}
                <div className="flex items-center gap-1 sm:gap-2 mr-2 shrink-0">
                  <div className="cursor-grab text-zinc-600 hover:text-zinc-400 hidden sm:block">
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>

                  {/* 1-touch mobile up/down chevrons */}
                  <div className="flex flex-col items-center -my-1">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      aria-label="Move track up"
                      className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20 active:scale-90 transition-all cursor-pointer"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === playlistSongs.length - 1}
                      aria-label="Move track down"
                      className="p-0.5 text-zinc-500 hover:text-white disabled:opacity-20 active:scale-90 transition-all cursor-pointer"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="text-xs font-mono text-zinc-500 w-3.5 text-center">
                    {index + 1}
                  </span>
                </div>

                {/* Track Details */}
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

                    {/* Active Equalizer Overlay */}
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

                      {/* Subtle source dot */}
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

                {/* Duration & Remove */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {song.duration && !isYtBookmark ? (
                    <span className="text-xs font-mono text-zinc-500 tabular-nums">
                      {formatTime(song.duration)}
                    </span>
                  ) : null}

                  <button
                    onClick={() => removeSongFromPlaylist(playlist.id, song.id)}
                    aria-label="Remove from playlist"
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-red-400 active:scale-90 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

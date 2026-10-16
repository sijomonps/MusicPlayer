"use client";

import React, { useState } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  Music,
  Maximize2,
  Loader2,
  FolderPlus,
  Check,
  Plus,
  X,
} from "lucide-react";
import { useAudio } from "@/lib/audio-context";
import { useLibrary } from "@/lib/library-context";
import { formatTime } from "@/lib/format-utils";

interface AudioPlayerProps {
  onOpenFullScreen: () => void;
}

export function AudioPlayer({ onOpenFullScreen }: AudioPlayerProps) {
  const {
    currentSong,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    volume,
    isMuted,
    repeat,
    shuffle,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
  } = useAudio();

  const {
    playlists,
    playlistSongsMap,
    addSongToPlaylist,
    removeSongFromPlaylist,
    createPlaylist,
  } = useLibrary();

  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [isPlaylistMenuOpen, setIsPlaylistMenuOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isCreatingInline, setIsCreatingInline] = useState(false);

  if (!currentSong) return null;

  const displayTime = isScrubbing ? scrubValue : currentTime;
  const progressPercent = duration > 0 ? (displayTime / duration) * 100 : 0;

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsScrubbing(true);
    setScrubValue(parseFloat(e.target.value));
  };

  const handleSeekCommit = () => {
    seek(scrubValue);
    setIsScrubbing(false);
  };

  const handleTogglePlaylist = async (playlistId: string) => {
    const songIds = playlistSongsMap[playlistId] || [];
    if (songIds.includes(currentSong.id)) {
      await removeSongFromPlaylist(playlistId, currentSong.id);
    } else {
      await addSongToPlaylist(playlistId, currentSong.id);
    }
  };

  const handleCreateAndAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPlaylistName.trim();
    if (!name) return;
    try {
      const created = await createPlaylist(name);
      await addSongToPlaylist(created.id, currentSong.id);
      setNewPlaylistName("");
      setIsCreatingInline(false);
    } catch (err) {
      console.warn("Could not create playlist:", err);
    }
  };

  return (
    <div className="hidden md:block fixed bottom-0 left-0 right-0 z-40 h-20 bg-zinc-950/85 backdrop-blur-2xl border-t border-white/[0.08] transition-all">
      <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between gap-6">
        {/* Left: Track Info & Playlist Button */}
        <div className="flex items-center gap-3 w-72 min-w-0">
          <div
            onClick={onOpenFullScreen}
            className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] overflow-hidden shrink-0 flex items-center justify-center cursor-pointer group relative"
          >
            {currentSong.artwork_url ? (
              <img
                src={currentSong.artwork_url}
                alt={currentSong.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            ) : (
              <Music className="w-5 h-5 text-zinc-500" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 className="w-3.5 h-3.5 text-white" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <p
              onClick={onOpenFullScreen}
              className="text-xs sm:text-sm font-semibold text-white truncate cursor-pointer hover:underline"
            >
              {currentSong.title}
            </p>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
              {currentSong.artist}
            </p>
          </div>

          {/* Quick Playlist Popover Toggle */}
          <div className="relative">
            <button
              onClick={() => setIsPlaylistMenuOpen(!isPlaylistMenuOpen)}
              title="Add to playlist"
              aria-label="Add to playlist"
              className={`p-2 rounded-xl transition-colors cursor-pointer ${
                isPlaylistMenuOpen
                  ? "bg-white text-black"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.06]"
              }`}
            >
              <FolderPlus className="w-4 h-4" />
            </button>

            {/* Desktop Playlist Popover */}
            {isPlaylistMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20 cursor-default"
                  onClick={() => {
                    setIsPlaylistMenuOpen(false);
                    setIsCreatingInline(false);
                  }}
                />
                <div className="absolute left-0 bottom-full mb-3 w-64 rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl p-3 z-30 space-y-2.5 animate-fade-in-up">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                      Add to Playlist
                    </span>
                    <button
                      onClick={() => setIsPlaylistMenuOpen(false)}
                      className="text-zinc-500 hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {playlists.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-1">No playlists yet</p>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1 no-scrollbar">
                      {playlists.map((pl) => {
                        const isMember = (playlistSongsMap[pl.id] || []).includes(
                          currentSong.id
                        );
                        return (
                          <button
                            key={pl.id}
                            onClick={() => handleTogglePlaylist(pl.id)}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs hover:bg-white/[0.06] text-left transition-colors cursor-pointer"
                          >
                            <span className="truncate text-zinc-300">
                              {pl.name}
                            </span>
                            {isMember && (
                              <Check className="w-3.5 h-3.5 text-white shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Inline Create */}
                  {isCreatingInline ? (
                    <form
                      onSubmit={handleCreateAndAdd}
                      className="flex items-center gap-1.5 pt-1"
                    >
                      <input
                        type="text"
                        value={newPlaylistName}
                        onChange={(e) => setNewPlaylistName(e.target.value)}
                        placeholder="New playlist..."
                        autoFocus
                        className="flex-1 px-2.5 py-1 rounded-lg text-xs bg-white/[0.06] border border-white/15 text-white placeholder:text-zinc-500 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 rounded-lg bg-white text-black text-xs font-semibold"
                      >
                        Add
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setIsCreatingInline(true)}
                      className="w-full flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white pt-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>New Playlist</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Center: Controls & Scrubber */}
        <div className="flex flex-col items-center gap-1.5 flex-1 max-w-xl">
          {/* Transport Controls */}
          <div className="flex items-center gap-4">
            <button
              onClick={toggleShuffle}
              aria-label="Toggle shuffle"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                shuffle
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <Shuffle className="w-4 h-4" />
            </button>

            <button
              onClick={prevTrack}
              aria-label="Previous track"
              className="p-1.5 text-zinc-300 hover:text-white active:scale-90 transition-transform cursor-pointer"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={togglePlay}
              disabled={isLoading || !currentSong.audio_url}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-4 h-4 fill-current" />
              ) : (
                <Play className="w-4 h-4 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={() => nextTrack(false)}
              aria-label="Next track"
              className="p-1.5 text-zinc-300 hover:text-white active:scale-90 transition-transform cursor-pointer"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={toggleRepeat}
              aria-label="Toggle repeat"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                repeat !== "off"
                  ? "text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {repeat === "one" ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Scrubber */}
          <div className="w-full flex items-center gap-3 text-xs font-mono text-zinc-500">
            <span className="w-9 text-right tabular-nums">
              {formatTime(displayTime)}
            </span>
            <div className="relative flex-1 flex items-center group">
              <input
                type="range"
                min="0"
                max={duration || 100}
                step="0.1"
                value={displayTime}
                onChange={handleSeekChange}
                onMouseUp={handleSeekCommit}
                onTouchEnd={handleSeekCommit}
                disabled={!duration}
                aria-label="Seek track"
                className="w-full h-1 bg-white/[0.1] rounded-full appearance-none cursor-pointer accent-white disabled:opacity-40 group-hover:h-1.5 transition-all"
              />
              <div
                className="absolute left-0 top-0 bottom-0 bg-white/40 rounded-full pointer-events-none group-hover:h-1.5 h-1"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="w-9 tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Right: Volume & Expand */}
        <div className="flex items-center justify-end gap-3 w-72">
          <button
            onClick={toggleMute}
            aria-label="Mute toggle"
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label="Volume slider"
            className="w-24 h-1 bg-white/[0.1] rounded-full appearance-none cursor-pointer accent-white hover:h-1.5 transition-all"
          />
          <button
            onClick={onOpenFullScreen}
            aria-label="Expand player"
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-white/[0.06] rounded-lg transition-colors ml-1 cursor-pointer"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

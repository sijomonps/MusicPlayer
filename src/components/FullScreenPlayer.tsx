"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  ListMusic,
  FolderPlus,
  Check,
  Plus,
  ExternalLink,
  Music,
  Loader2,
} from "lucide-react";
import { useAudio } from "@/lib/audio-context";
import { useLibrary } from "@/lib/library-context";
import { formatTime } from "@/lib/format-utils";

interface FullScreenPlayerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FullScreenPlayer({ isOpen, onClose }: FullScreenPlayerProps) {
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
    queue,
    queueIndex,
    togglePlay,
    nextTrack,
    prevTrack,
    seek,
    setVolume,
    toggleMute,
    toggleRepeat,
    toggleShuffle,
    playSong,
  } = useAudio();

  const {
    playlists,
    playlistSongsMap,
    addSongToPlaylist,
    removeSongFromPlaylist,
    createPlaylist,
  } = useLibrary();

  const [activeTab, setActiveTab] = useState<"player" | "queue" | "playlists">("player");
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);

  if (!isOpen || !currentSong) return null;

  const displayTime = isScrubbing ? scrubValue : currentTime;

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
      setIsCreatingPlaylist(false);
    } catch (err) {
      console.warn("Could not create playlist:", err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-between pt-[env(safe-area-inset-top,1.5rem)] pb-[env(safe-area-inset-bottom,1.5rem)] px-6 overflow-hidden select-none animate-fade-in-up">
      {/* Dynamic Ambient Blurred Background */}
      <div className="absolute inset-0 -z-10 overflow-hidden bg-black/85">
        {currentSong.artwork_url ? (
          <div
            className="absolute inset-0 bg-cover bg-center blur-3xl opacity-30 scale-125 transition-all duration-700 pointer-events-none"
            style={{ backgroundImage: `url(${currentSong.artwork_url})` }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-[#060608] opacity-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80" />
      </div>

      {/* Top Header Bar */}
      <div className="flex flex-col items-center">
        {/* iOS Drag Handle Pill */}
        <div className="w-10 h-1 rounded-full bg-white/20 mb-3" />

        <div className="w-full flex items-center justify-between">
          {/* Downward Chevron on Left */}
          <button
            onClick={onClose}
            aria-label="Collapse player"
            className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] active:scale-90 flex items-center justify-center text-zinc-300 hover:text-white transition-all cursor-pointer"
          >
            <ChevronDown className="w-5 h-5" />
          </button>

          {/* Center Context Pill */}
          <div className="text-center">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-zinc-400">
              {activeTab === "queue"
                ? "Queue"
                : activeTab === "playlists"
                ? "Add to Playlist"
                : "Now Playing"}
            </p>
            <p className="text-xs text-zinc-300 font-medium truncate max-w-[180px]">
              {currentSong.album || "Sijomons Music"}
            </p>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-1.5">
            {/* Quick + Playlist Button */}
            <button
              onClick={() =>
                setActiveTab(activeTab === "playlists" ? "player" : "playlists")
              }
              aria-label="Add to playlist"
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                activeTab === "playlists"
                  ? "bg-white text-black"
                  : "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white"
              }`}
            >
              <FolderPlus className="w-4 h-4" />
            </button>

            {/* Queue Toggle Button */}
            <button
              onClick={() =>
                setActiveTab(activeTab === "queue" ? "player" : "queue")
              }
              aria-label="Toggle queue"
              className={`w-9 h-9 rounded-full flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                activeTab === "queue"
                  ? "bg-white text-black"
                  : "bg-white/[0.06] hover:bg-white/[0.12] text-zinc-300 hover:text-white"
              }`}
            >
              <ListMusic className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Center Area */}
      {activeTab === "queue" ? (
        /* Queue View */
        <div className="flex-1 overflow-y-auto my-4 space-y-2 pr-1 no-scrollbar animate-fade-in-up">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Queue ({queue.length})
          </div>
          {queue.map((song, idx) => {
            const isCurrent = idx === queueIndex;
            return (
              <div
                key={`${song.id}-${idx}`}
                onClick={() => playSong(song)}
                className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                  isCurrent
                    ? "bg-white/[0.12] border border-white/20 text-white font-medium"
                    : "hover:bg-white/[0.05] text-zinc-300 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0 overflow-hidden">
                    {song.artwork_url ? (
                      <img
                        src={song.artwork_url}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music className="w-4 h-4 text-zinc-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm truncate font-medium">
                      {song.title}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">
                      {song.artist}
                    </p>
                  </div>
                </div>
                {isCurrent && (
                  <span className="text-[11px] font-mono text-white/80 shrink-0">
                    Playing
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : activeTab === "playlists" ? (
        /* Instant Playlist Assignment View */
        <div className="flex-1 overflow-y-auto my-4 space-y-3 pr-1 no-scrollbar animate-fade-in-up">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Select Playlist
            </span>
            <button
              onClick={() => setIsCreatingPlaylist(!isCreatingPlaylist)}
              className="text-xs text-white hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New</span>
            </button>
          </div>

          {/* Inline Create Input */}
          {isCreatingPlaylist && (
            <form
              onSubmit={handleCreateAndAdd}
              className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.05] border border-white/[0.1]"
            >
              <input
                type="text"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="Playlist name..."
                autoFocus
                className="flex-1 px-2.5 py-1 text-xs bg-transparent text-white placeholder:text-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1 rounded-lg bg-white text-black text-xs font-semibold cursor-pointer"
              >
                Create
              </button>
            </form>
          )}

          {playlists.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-500">
              No playlists yet. Create one above!
            </div>
          ) : (
            <div className="space-y-1.5">
              {playlists.map((pl) => {
                const isMember = (playlistSongsMap[pl.id] || []).includes(
                  currentSong.id
                );
                return (
                  <button
                    key={pl.id}
                    onClick={() => handleTogglePlaylist(pl.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all text-left cursor-pointer ${
                      isMember
                        ? "bg-white/[0.12] border-white/20 text-white"
                        : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] text-zinc-300"
                    }`}
                  >
                    <div>
                      <p className="text-xs sm:text-sm font-semibold truncate">
                        {pl.name}
                      </p>
                      <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                        {(playlistSongsMap[pl.id] || []).length} tracks
                      </p>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                        isMember
                          ? "bg-white text-black"
                          : "border border-white/20 text-transparent"
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Breathing Artwork Display */
        <div className="flex-1 flex flex-col items-center justify-center my-4 sm:my-6">
          <div
            className={`relative w-64 h-64 sm:w-80 sm:h-80 rounded-3xl overflow-hidden bg-white/[0.04] border border-white/[0.08] flex items-center justify-center transition-all duration-500 ease-out ${
              isPlaying
                ? "scale-100 shadow-[0_25px_60px_rgba(0,0,0,0.85)]"
                : "scale-90 opacity-75 shadow-xl"
            }`}
          >
            {currentSong.artwork_url ? (
              <img
                src={currentSong.artwork_url}
                alt={currentSong.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-500 space-y-2">
                <Music className="w-16 h-16 stroke-1" />
                <span className="text-[11px] font-mono tracking-wider uppercase text-zinc-600">
                  Sijomons Music
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom Controls Section */}
      <div className="space-y-5 mb-2 max-w-md mx-auto w-full">
        {/* Track Title, Artist & External Link */}
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-4">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white truncate">
              {currentSong.title}
            </h1>
            <p className="text-sm text-zinc-400 font-medium truncate mt-0.5">
              {currentSong.artist}
            </p>
          </div>

          {currentSong.youtube_url && (
            <a
              href={currentSong.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open on YouTube"
              className="p-2 rounded-full bg-white/[0.06] text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>

        {/* Minimal Interactive Scrubber */}
        <div className="space-y-1.5">
          <div className="relative flex items-center group py-1.5">
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
              aria-label="Seek track position"
              className="w-full h-1.5 group-hover:h-2 group-active:h-2 bg-white/15 rounded-full appearance-none cursor-pointer accent-white disabled:opacity-40 transition-all"
            />
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="tabular-nums">{formatTime(displayTime)}</span>
            <span className="tabular-nums">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Tactile Transport Controls */}
        <div className="flex items-center justify-between py-1">
          {/* Shuffle */}
          <button
            onClick={toggleShuffle}
            aria-label="Toggle shuffle"
            className={`w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-90 cursor-pointer ${
              shuffle
                ? "text-white bg-white/10"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          {/* Previous */}
          <button
            onClick={prevTrack}
            aria-label="Previous track"
            className="w-12 h-12 flex items-center justify-center text-zinc-200 hover:text-white active:scale-90 transition-transform cursor-pointer"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          {/* Large High-Contrast Play/Pause Circle */}
          <button
            onClick={togglePlay}
            disabled={isLoading || !currentSong.audio_url}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-white text-black flex items-center justify-center shadow-2xl active:scale-95 transition-transform disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-1" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={() => nextTrack(false)}
            aria-label="Next track"
            className="w-12 h-12 flex items-center justify-center text-zinc-200 hover:text-white active:scale-90 transition-transform cursor-pointer"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          {/* Repeat */}
          <button
            onClick={toggleRepeat}
            aria-label="Toggle repeat"
            className={`w-11 h-11 flex items-center justify-center rounded-full transition-all active:scale-90 cursor-pointer ${
              repeat !== "off"
                ? "text-white bg-white/10"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {repeat === "one" ? (
              <Repeat1 className="w-5 h-5" />
            ) : (
              <Repeat className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Volume Slider (hidden on mobile Safari since iOS volume is hardware-controlled) */}
        <div className="hidden sm:flex items-center gap-3 pt-2">
          <button
            onClick={toggleMute}
            aria-label="Mute toggle"
            className="text-zinc-400 hover:text-white cursor-pointer"
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
            className="w-full h-1 bg-white/[0.1] rounded-full appearance-none cursor-pointer accent-white"
          />
        </div>
      </div>
    </div>
  );
}

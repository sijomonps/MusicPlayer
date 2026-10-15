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
  ExternalLink,
  Music,
} from "lucide-react";
import { useAudio } from "@/lib/audio-context";
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

  const [showQueue, setShowQueue] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

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

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col justify-between pt-[env(safe-area-inset-top,1.5rem)] pb-[env(safe-area-inset-bottom,1.5rem)] px-6 transition-all duration-300">
      {/* Top Bar */}
      <div className="flex items-center justify-between py-4">
        <button
          onClick={onClose}
          aria-label="Collapse player"
          className="p-2 -ml-2 rounded-full text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 active:scale-95 transition-transform"
        >
          <ChevronDown className="w-6 h-6" />
        </button>

        <div className="text-center">
          <p className="text-xs uppercase tracking-widest font-semibold text-zinc-400 dark:text-zinc-500">
            {showQueue ? "Up Next" : "Now Playing"}
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium truncate max-w-[200px]">
            {currentSong.album || "Minimal Player"}
          </p>
        </div>

        <button
          onClick={() => setShowQueue(!showQueue)}
          aria-label="Toggle Queue"
          className={`p-2 -mr-2 rounded-full transition-colors ${
            showQueue
              ? "text-zinc-900 dark:text-zinc-100 bg-zinc-200 dark:bg-zinc-800"
              : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          }`}
        >
          <ListMusic className="w-5 h-5" />
        </button>
      </div>

      {showQueue ? (
        /* Queue View */
        <div className="flex-1 overflow-y-auto my-4 space-y-2 pr-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">
            Playing Queue ({queue.length})
          </div>
          {queue.map((song, idx) => {
            const isCurrent = idx === queueIndex;
            return (
              <div
                key={`${song.id}-${idx}`}
                onClick={() => playSong(song)}
                className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all ${
                  isCurrent
                    ? "bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-300 dark:border-zinc-700 font-medium"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900/50 text-zinc-700 dark:text-zinc-300"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden">
                    {song.artwork_url ? (
                      <img
                        src={song.artwork_url}
                        alt={song.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music className="w-4 h-4 text-zinc-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm truncate">{song.title}</p>
                    <p className="text-xs text-zinc-400 truncate">{song.artist}</p>
                  </div>
                </div>
                {isCurrent && (
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                    Playing
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Main Artwork Display */
        <div className="flex-1 flex flex-col items-center justify-center my-6">
          <div className="relative w-64 h-64 sm:w-80 sm:h-80 rounded-2xl overflow-hidden shadow-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center">
            {currentSong.artwork_url ? (
              <img
                src={currentSong.artwork_url}
                alt={currentSong.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-400 space-y-2">
                <Music className="w-16 h-16 stroke-1" />
                <span className="text-xs font-mono uppercase tracking-wider">Minimal Audio</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Song Details & External links */}
      <div className="space-y-6 mb-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-4">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
              {currentSong.title}
            </h1>
            <p className="text-sm sm:text-base text-zinc-500 dark:text-zinc-400 font-medium truncate mt-0.5">
              {currentSong.artist}
            </p>
          </div>
          {currentSong.youtube_url && (
            <a
              href={currentSong.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open on YouTube"
              className="p-2 rounded-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          )}
        </div>

        {/* Scrubber / Progress Bar */}
        <div className="space-y-1.5">
          <div className="relative flex items-center group">
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
              className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-900 dark:accent-zinc-100 disabled:opacity-40"
            />
          </div>
          <div className="flex items-center justify-between text-xs font-mono text-zinc-400 dark:text-zinc-500">
            <span>{formatTime(displayTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-between py-2">
          {/* Shuffle */}
          <button
            onClick={toggleShuffle}
            aria-label="Toggle shuffle"
            className={`p-3 rounded-full transition-colors active:scale-95 ${
              shuffle
                ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                : "text-zinc-400 dark:text-zinc-600 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          {/* Previous */}
          <button
            onClick={prevTrack}
            aria-label="Previous track"
            className="p-3 text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-zinc-50 active:scale-90 transition-transform"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          {/* Play/Pause Main Button */}
          <button
            onClick={togglePlay}
            disabled={isLoading || !currentSong.audio_url}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="w-16 h-16 rounded-full bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 flex items-center justify-center shadow-lg active:scale-95 transition-transform disabled:opacity-50"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-1" />
            )}
          </button>

          {/* Next */}
          <button
            onClick={() => nextTrack(false)}
            aria-label="Next track"
            className="p-3 text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-zinc-50 active:scale-90 transition-transform"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          {/* Repeat */}
          <button
            onClick={toggleRepeat}
            aria-label="Toggle repeat"
            className={`p-3 rounded-full transition-colors active:scale-95 ${
              repeat !== "off"
                ? "text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800"
                : "text-zinc-400 dark:text-zinc-600 hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {repeat === "one" ? (
              <Repeat1 className="w-5 h-5" />
            ) : (
              <Repeat className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Desktop Volume Slider (hidden on iOS Safari since iOS volume is hardware-only) */}
        <div className="hidden sm:flex items-center gap-3 pt-2">
          <button
            onClick={toggleMute}
            aria-label="Mute toggle"
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
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
            className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-900 dark:accent-zinc-100"
          />
        </div>

        {/* iPhone Volume Note */}
        <p className="block sm:hidden text-center text-[11px] text-zinc-400 dark:text-zinc-600">
          Tip: Use iPhone hardware buttons for volume adjustment
        </p>
      </div>
    </div>
  );
}

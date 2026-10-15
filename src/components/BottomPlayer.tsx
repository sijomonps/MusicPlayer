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
} from "lucide-react";
import { useAudio } from "@/lib/audio-context";
import { formatTime } from "@/lib/format-utils";
import { FullScreenPlayer } from "./FullScreenPlayer";

export function BottomPlayer() {
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

  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

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

  return (
    <>
      <div className="fixed bottom-[65px] md:bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 transition-all">
        {/* Subtle top progress bar on mobile */}
        <div className="block md:hidden h-1 w-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-150"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 py-2.5 sm:py-3 flex items-center justify-between gap-3">
          {/* Track Info (Clicking opens FullScreenPlayer on mobile) */}
          <div
            onClick={() => setIsFullScreenOpen(true)}
            className="flex items-center gap-3 min-w-0 cursor-pointer flex-1 md:flex-initial md:w-64"
          >
            <div className="w-11 h-11 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 overflow-hidden border border-zinc-200 dark:border-zinc-700">
              {currentSong.artwork_url ? (
                <img
                  src={currentSong.artwork_url}
                  alt={currentSong.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Music className="w-5 h-5 text-zinc-400" />
              )}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {currentSong.title}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                {currentSong.artist}
              </p>
            </div>
          </div>

          {/* Desktop Center: Scrubber & Controls */}
          <div className="hidden md:flex flex-col items-center gap-1.5 flex-1 max-w-xl">
            <div className="flex items-center gap-5">
              <button
                onClick={toggleShuffle}
                aria-label="Toggle shuffle"
                className={`p-1.5 rounded-md transition-colors ${
                  shuffle
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
              >
                <Shuffle className="w-4 h-4" />
              </button>

              <button
                onClick={prevTrack}
                aria-label="Previous track"
                className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>

              <button
                onClick={togglePlay}
                disabled={isLoading || !currentSong.audio_url}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="w-9 h-9 rounded-full bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
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
                className="p-1.5 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>

              <button
                onClick={toggleRepeat}
                aria-label="Toggle repeat"
                className={`p-1.5 rounded-md transition-colors ${
                  repeat !== "off"
                    ? "text-zinc-900 dark:text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                }`}
              >
                {repeat === "one" ? (
                  <Repeat1 className="w-4 h-4" />
                ) : (
                  <Repeat className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Desktop Scrubber */}
            <div className="w-full flex items-center gap-3 text-xs font-mono text-zinc-400">
              <span className="w-9 text-right">{formatTime(displayTime)}</span>
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
                className="w-full h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-900 dark:accent-zinc-100 disabled:opacity-40"
              />
              <span className="w-9">{formatTime(duration)}</span>
            </div>
          </div>

          {/* Desktop Right: Volume & Expand */}
          <div className="hidden md:flex items-center justify-end gap-3 w-64">
            <button
              onClick={toggleMute}
              aria-label="Mute toggle"
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
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
              className="w-24 h-1 bg-zinc-200 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-900 dark:accent-zinc-100"
            />
            <button
              onClick={() => setIsFullScreenOpen(true)}
              aria-label="Expand player"
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 ml-2"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile Right: Compact Play/Pause & Next Buttons */}
          <div className="flex md:hidden items-center gap-1 shrink-0">
            <button
              onClick={togglePlay}
              disabled={isLoading || !currentSong.audio_url}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="w-10 h-10 rounded-full bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
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
              className="w-10 h-10 rounded-full text-zinc-700 dark:text-zinc-300 flex items-center justify-center active:scale-90 transition-transform"
            >
              <SkipForward className="w-5 h-5 fill-current" />
            </button>
          </div>
        </div>
      </div>

      <FullScreenPlayer
        isOpen={isFullScreenOpen}
        onClose={() => setIsFullScreenOpen(false)}
      />
    </>
  );
}

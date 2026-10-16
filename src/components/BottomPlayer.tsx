"use client";

import React, { useState } from "react";
import {
  Play,
  Pause,
  SkipForward,
  Music,
  Loader2,
} from "lucide-react";
import { useAudio } from "@/lib/audio-context";
import { FullScreenPlayer } from "./FullScreenPlayer";
import { AudioPlayer } from "./AudioPlayer";

export function BottomPlayer() {
  const {
    currentSong,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    togglePlay,
    nextTrack,
  } = useAudio();

  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false);

  if (!currentSong) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Mobile Floating Glass Pill (< md) */}
      <div className="md:hidden fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px)+8px)] left-0 right-0 z-40 px-2.5 pointer-events-none">
        <div className="pointer-events-auto max-w-md mx-auto rounded-2xl bg-zinc-900/85 backdrop-blur-2xl border border-white/10 shadow-2xl overflow-hidden transition-all duration-300">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            {/* Left: Artwork + Title & Artist (Tap to expand full screen) */}
            <div
              onClick={() => setIsFullScreenOpen(true)}
              className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer select-none active:opacity-80 transition-opacity"
            >
              <div className="w-[38px] h-[38px] rounded-xl bg-white/[0.04] border border-white/[0.08] overflow-hidden shrink-0 flex items-center justify-center relative">
                {currentSong.artwork_url ? (
                  <img
                    src={currentSong.artwork_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="w-4 h-4 text-zinc-500" />
                )}
              </div>

              <div className="min-w-0 pr-1">
                <p className="text-xs font-semibold text-white truncate">
                  {currentSong.title}
                </p>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  {currentSong.artist}
                </p>
              </div>
            </div>

            {/* Right: Touch Hit Areas (44x44pt) for Play/Pause & Next */}
            <div className="flex items-center shrink-0">
              {/* Play / Pause Button */}
              <button
                onClick={togglePlay}
                disabled={isLoading || !currentSong.audio_url}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="w-11 h-11 flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                <div className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow-md active:scale-90 transition-transform">
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-black" />
                  ) : isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </div>
              </button>

              {/* Next Track Button */}
              <button
                onClick={() => nextTrack(false)}
                aria-label="Next track"
                className="w-11 h-11 flex items-center justify-center text-zinc-300 hover:text-white cursor-pointer active:scale-90 transition-transform"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
            </div>
          </div>

          {/* Razor-thin Progress Bar along bottom edge */}
          <div className="h-[2px] w-full bg-white/[0.06]">
            <div
              className="h-full bg-white transition-all duration-150 ease-linear"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Desktop Audio Player Bar (>= md) */}
      <AudioPlayer onOpenFullScreen={() => setIsFullScreenOpen(true)} />

      {/* iOS-Style Fullscreen Immersive Sheet */}
      <FullScreenPlayer
        isOpen={isFullScreenOpen}
        onClose={() => setIsFullScreenOpen(false)}
      />
    </>
  );
}

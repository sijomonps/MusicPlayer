"use client";

import React, {
  createContext,
  useContext,
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { Song, RepeatMode } from "./types";
import {
  updateMediaSessionMetadata,
  updateMediaSessionPlaybackState,
  updateMediaSessionPositionState,
  registerMediaSessionHandlers,
} from "./media-session";

interface AudioContextType {
  currentSong: Song | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  queue: Song[];
  queueIndex: number;
  playSong: (song: Song, newQueue?: Song[]) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  nextTrack: (autoAdvance?: boolean) => void;
  prevTrack: () => void;
  seek: (time: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleRepeat: () => void;
  toggleShuffle: () => void;
  addToQueue: (song: Song) => void;
  removeFromQueue: (index: number) => void;
  setQueue: (songs: Song[]) => void;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [shuffle, setShuffle] = useState(false);

  const [queue, setQueue] = useState<Song[]>([]);
  const [originalQueue, setOriginalQueue] = useState<Song[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);

  // Keep ref to latest state for callbacks and audio event listeners
  const stateRef = useRef({
    currentSong,
    queue,
    originalQueue,
    queueIndex,
    repeat,
    shuffle,
    volume,
    isMuted,
  });

  useEffect(() => {
    stateRef.current = {
      currentSong,
      queue,
      originalQueue,
      queueIndex,
      repeat,
      shuffle,
      volume,
      isMuted,
    };
  }, [currentSong, queue, originalQueue, queueIndex, repeat, shuffle, volume, isMuted]);

  // Execute playback on the persistent audio element
  const loadAndPlay = useCallback(async (song: Song) => {
    if (!audioRef.current) return;
    const audio = audioRef.current;

    // Direct MP3 or Cloudflare R2 proxy URL
    if (!song.audio_url) {
      console.warn("Song does not have a streamable audio URL:", song);
      return;
    }

    setIsLoading(true);
    setCurrentSong(song);
    updateMediaSessionMetadata(song);

    try {
      // Re-use single persistent audio element to preserve iOS audio session
      if (audio.src !== song.audio_url) {
        audio.src = song.audio_url;
        audio.load();
      }

      await audio.play();
      setIsPlaying(true);
      updateMediaSessionPlaybackState("playing");
    } catch (err: unknown) {
      console.warn("Playback prevented or interrupted:", err);
      // If autoplay policy blocked it, update state
      setIsPlaying(false);
      updateMediaSessionPlaybackState("paused");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const playSong = useCallback(
    (song: Song, newQueue?: Song[]) => {
      let targetQueue = newQueue || queue;
      if (newQueue) {
        setOriginalQueue(newQueue);
        setQueue(newQueue);
        targetQueue = newQueue;
      }

      // Check if song exists in targetQueue
      let index = targetQueue.findIndex((s) => s.id === song.id);
      if (index === -1) {
        targetQueue = [song, ...targetQueue];
        setQueue(targetQueue);
        setOriginalQueue(targetQueue);
        index = 0;
      }

      setQueueIndex(index);
      loadAndPlay(song);
    },
    [queue, loadAndPlay]
  );

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      updateMediaSessionPlaybackState("paused");
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current && currentSong) {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          updateMediaSessionPlaybackState("playing");
        })
        .catch((e) => console.warn("Failed to resume:", e));
    }
  }, [currentSong]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      if (!currentSong && queue.length > 0) {
        playSong(queue[0]);
      } else {
        resume();
      }
    }
  }, [isPlaying, pause, resume, currentSong, queue, playSong]);

  const nextTrack = useCallback(
    (autoAdvance = false) => {
      const { queue: currentQ, queueIndex: currIdx, repeat: currentRep } = stateRef.current;
      if (currentQ.length === 0) return;

      if (autoAdvance && currentRep === "one") {
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(console.warn);
        }
        return;
      }

      let nextIndex = currIdx + 1;
      if (nextIndex >= currentQ.length) {
        if (currentRep === "all" || !autoAdvance) {
          nextIndex = 0;
        } else {
          // Finished playlist with repeat off
          setIsPlaying(false);
          updateMediaSessionPlaybackState("paused");
          return;
        }
      }

      const nextSong = currentQ[nextIndex];
      if (nextSong) {
        setQueueIndex(nextIndex);
        loadAndPlay(nextSong);
      }
    },
    [loadAndPlay]
  );

  const prevTrack = useCallback(() => {
    const { queue: currentQ, queueIndex: currIdx } = stateRef.current;
    if (currentQ.length === 0) return;

    // If more than 3 seconds into song, restart song
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }

    let prevIndex = currIdx - 1;
    if (prevIndex < 0) {
      prevIndex = currentQ.length - 1;
    }

    const prevSong = currentQ[prevIndex];
    if (prevSong) {
      setQueueIndex(prevIndex);
      loadAndPlay(prevSong);
    }
  }, [loadAndPlay]);

  const seek = useCallback((time: number) => {
    if (audioRef.current && isFinite(time)) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
      updateMediaSessionPositionState(time, audioRef.current.duration || 0);
    }
  }, []);

  const setVolume = useCallback((val: number) => {
    const clamped = Math.max(0, Math.min(1, val));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
      if (audioRef.current) audioRef.current.muted = false;
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.muted = next;
      }
      return next;
    });
  }, []);

  const toggleRepeat = useCallback(() => {
    setRepeat((prev) => {
      if (prev === "off") return "all";
      if (prev === "all") return "one";
      return "off";
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => {
      const nextShuffle = !prev;
      if (nextShuffle) {
        // Shuffle queue while keeping current song at current position
        const current = stateRef.current.currentSong;
        const rest = stateRef.current.queue.filter((s) => s.id !== current?.id);
        const shuffled = [...rest].sort(() => Math.random() - 0.5);
        const newQ = current ? [current, ...shuffled] : shuffled;
        setQueue(newQ);
        setQueueIndex(0);
      } else {
        // Restore original queue order
        const orig = stateRef.current.originalQueue;
        setQueue(orig);
        if (stateRef.current.currentSong) {
          const idx = orig.findIndex((s) => s.id === stateRef.current.currentSong?.id);
          setQueueIndex(idx !== -1 ? idx : 0);
        }
      }
      return nextShuffle;
    });
  }, []);

  const addToQueue = useCallback((song: Song) => {
    setQueue((prev) => [...prev, song]);
    setOriginalQueue((prev) => [...prev, song]);
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
    setOriginalQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Register Media Session API handlers once on mount
  useEffect(() => {
    registerMediaSessionHandlers({
      onPlay: () => {
        if (audioRef.current) {
          audioRef.current
            .play()
            .then(() => {
              setIsPlaying(true);
              updateMediaSessionPlaybackState("playing");
            })
            .catch(console.warn);
        }
      },
      onPause: () => {
        if (audioRef.current) {
          audioRef.current.pause();
          setIsPlaying(false);
          updateMediaSessionPlaybackState("paused");
        }
      },
      onPrevious: () => prevTrack(),
      onNext: () => nextTrack(false),
      onSeekTo: (time) => seek(time),
      onSeekBackward: () => {
        if (audioRef.current) {
          seek(Math.max(0, audioRef.current.currentTime - 10));
        }
      },
      onSeekForward: () => {
        if (audioRef.current) {
          seek(Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + 10));
        }
      },
    });
  }, [prevTrack, nextTrack, seek]);

  // Setup listeners on persistent <audio> element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      updateMediaSessionPositionState(audio.currentTime, audio.duration || 0);
    };

    const handleDurationChange = () => {
      if (isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const handleEnded = () => {
      // Automatic next-track playback after screen is locked
      nextTrack(true);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      updateMediaSessionPlaybackState("playing");
    };

    const handlePause = () => {
      setIsPlaying(false);
      updateMediaSessionPlaybackState("paused");
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handlePlaying = () => {
      setIsLoading(false);
    };

    const handleError = (e: Event) => {
      setIsLoading(false);
      console.warn("Audio element error:", audio.error || e);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("error", handleError);
    };
  }, [nextTrack]);

  return (
    <AudioContext.Provider
      value={{
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
        playSong,
        togglePlay,
        pause,
        resume,
        nextTrack,
        prevTrack,
        seek,
        setVolume,
        toggleMute,
        toggleRepeat,
        toggleShuffle,
        addToQueue,
        removeFromQueue,
        setQueue,
        audioRef,
      }}
    >
      {/* 
        Persistent HTML5 Audio Element:
        - NEVER unmounted
        - playsInline prevents iOS full screen video takeover
        - preload="auto" for fast buffering
      */}
      <audio
        ref={audioRef}
        playsInline
        preload="auto"
        className="hidden"
        aria-hidden="true"
      />
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) {
    throw new Error("useAudio must be used within an AudioProvider");
  }
  return context;
}

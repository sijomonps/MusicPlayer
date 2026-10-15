"use client";

import React, { useState, useEffect } from "react";
import {
  ArrowLeft,
  Play,
  Pause,
  Trash2,
  ChevronUp,
  ChevronDown,
  GripVertical,
  Music,
  ExternalLink,
  Plus,
} from "lucide-react";
import { YoutubeIcon } from "@/components/icons/YoutubeIcon";
import { Playlist, Song } from "@/lib/types";
import { useAudio } from "@/lib/audio-context";
import { useLibrary } from "@/lib/library-context";
import { formatTime } from "@/lib/format-utils";

interface PlaylistDetailProps {
  playlist: Playlist;
  onBack: () => void;
  onOpenAddModal: () => void;
}

export function PlaylistDetail({ playlist, onBack, onOpenAddModal }: PlaylistDetailProps) {
  const { currentSong, isPlaying, playSong, togglePlay } = useAudio();
  const {
    getPlaylistSongs,
    removeSongFromPlaylist,
    reorderPlaylistSongs,
    songs: allSongs,
    addSongToPlaylist,
  } = useLibrary();

  const [playlistSongs, setPlaylistSongs] = useState<Song[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingSong, setIsAddingSong] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    getPlaylistSongs(playlist.id).then((songs) => {
      if (mounted) {
        setPlaylistSongs(songs);
        setIsLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [playlist.id, getPlaylistSongs]);

  const handlePlaySong = (song: Song) => {
    if (song.source_type === "youtube_bookmark") {
      if (song.youtube_url) window.open(song.youtube_url, "_blank", "noopener,noreferrer");
      return;
    }
    if (currentSong?.id === song.id) {
      togglePlay();
    } else {
      const streamable = playlistSongs.filter((s) => s.source_type !== "youtube_bookmark");
      playSong(song, streamable);
    }
  };

  const handlePlayAll = () => {
    const streamable = playlistSongs.filter((s) => s.source_type !== "youtube_bookmark");
    if (streamable.length > 0) {
      playSong(streamable[0], streamable);
    }
  };

  const handleRemove = async (songId: string) => {
    await removeSongFromPlaylist(playlist.id, songId);
    setPlaylistSongs((prev) => prev.filter((s) => s.id !== songId));
  };

  // Move up
  const handleMoveUp = async (index: number) => {
    if (index <= 0) return;
    const newItems = [...playlistSongs];
    const temp = newItems[index - 1];
    newItems[index - 1] = newItems[index];
    newItems[index] = temp;
    setPlaylistSongs(newItems);
    await reorderPlaylistSongs(
      playlist.id,
      newItems.map((s) => s.id)
    );
  };

  // Move down
  const handleMoveDown = async (index: number) => {
    if (index >= playlistSongs.length - 1) return;
    const newItems = [...playlistSongs];
    const temp = newItems[index + 1];
    newItems[index + 1] = newItems[index];
    newItems[index] = temp;
    setPlaylistSongs(newItems);
    await reorderPlaylistSongs(
      playlist.id,
      newItems.map((s) => s.id)
    );
  };

  // HTML5 Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIdx(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (index: number) => {
    if (draggedIdx === null || draggedIdx === index) return;
    const newItems = [...playlistSongs];
    const [moved] = newItems.splice(draggedIdx, 1);
    newItems.splice(index, 0, moved);
    setPlaylistSongs(newItems);
    setDraggedIdx(null);
    await reorderPlaylistSongs(
      playlist.id,
      newItems.map((s) => s.id)
    );
  };

  // Add existing song from library
  const availableSongsToAdd = allSongs.filter(
    (s) => !playlistSongs.some((ps) => ps.id === s.id)
  );

  const handleQuickAdd = async (songId: string) => {
    await addSongToPlaylist(playlist.id, songId);
    const addedSong = allSongs.find((s) => s.id === songId);
    if (addedSong) {
      setPlaylistSongs((prev) => [...prev, addedSong]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button & Playlist Title */}
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Playlists</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {playlist.description}
              </p>
            )}
            <p className="text-xs text-zinc-400 mt-1 font-mono">
              {playlistSongs.length} {playlistSongs.length === 1 ? "track" : "tracks"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {playlistSongs.length > 0 && (
              <button
                onClick={handlePlayAll}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium hover:opacity-90 active:scale-95 transition-all shadow-xs"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Play All</span>
              </button>
            )}

            <button
              onClick={() => setIsAddingSong(!isAddingSong)}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{isAddingSong ? "Done Adding" : "Add Tracks"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Add from library tray */}
      {isAddingSong && (
        <div className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Add Tracks from Library
            </h3>
            <button
              onClick={onOpenAddModal}
              className="text-xs text-zinc-600 dark:text-zinc-300 underline"
            >
              Add new link or upload file
            </button>
          </div>

          {availableSongsToAdd.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">
              All tracks in your library are already in this playlist.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {availableSongsToAdd.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700/60"
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {s.title}
                    </p>
                    <p className="text-[11px] text-zinc-400 truncate">{s.artist}</p>
                  </div>
                  <button
                    onClick={() => handleQuickAdd(s.id)}
                    className="p-1 rounded bg-zinc-100 dark:bg-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200"
                    aria-label="Add to playlist"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Song List in playlist */}
      {isLoading ? (
        <div className="text-center py-12 text-xs text-zinc-400">Loading tracks...</div>
      ) : playlistSongs.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <Music className="w-10 h-10 mx-auto text-zinc-400 stroke-1 mb-3" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            This playlist is empty
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mt-1 mb-4">
            Click &quot;Add Tracks&quot; above to add songs from your library.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {playlistSongs.map((song, index) => {
            const isCurrent = currentSong?.id === song.id;
            const isYt = song.source_type === "youtube_bookmark";

            return (
              <div
                key={`${song.id}-${index}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(index)}
                className={`group flex items-center justify-between p-2.5 sm:p-3 rounded-xl transition-all ${
                  isCurrent
                    ? "bg-zinc-100 dark:bg-zinc-900/90 border border-zinc-200 dark:border-zinc-800"
                    : "hover:bg-zinc-50 dark:hover:bg-zinc-900/40 border border-transparent"
                }`}
              >
                {/* Drag handle & Order Controls */}
                <div className="flex items-center gap-1 sm:gap-2 mr-2 shrink-0">
                  <div className="cursor-grab text-zinc-300 dark:text-zinc-700 hover:text-zinc-500 hidden sm:block">
                    <GripVertical className="w-4 h-4" />
                  </div>

                  {/* Move Up/Down buttons for one-touch mobile iPhone use */}
                  <div className="flex flex-col sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      aria-label="Move track up"
                      className="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveDown(index)}
                      disabled={index === playlistSongs.length - 1}
                      aria-label="Move track down"
                      className="p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <span className="text-xs font-mono text-zinc-400 w-4 text-center">
                    {index + 1}
                  </span>
                </div>

                {/* Track Details */}
                <div
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                  onClick={() => handlePlaySong(song)}
                >
                  <div className="relative w-10 h-10 rounded-lg bg-zinc-200 dark:bg-zinc-800 overflow-hidden shrink-0 flex items-center justify-center">
                    {song.artwork_url ? (
                      <img
                        src={song.artwork_url}
                        alt={song.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Music className="w-4 h-4 text-zinc-400" />
                    )}
                    <div
                      className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${
                        isCurrent ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {isYt ? (
                        <ExternalLink className="w-3.5 h-3.5 text-white" />
                      ) : isCurrent && isPlaying ? (
                        <Pause className="w-3.5 h-3.5 text-white fill-current" />
                      ) : (
                        <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
                      )}
                    </div>
                  </div>

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
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                      {song.artist}
                    </p>
                  </div>
                </div>

                {/* Duration & Remove */}
                <div className="flex items-center gap-3 shrink-0">
                  {song.duration && !isYt ? (
                    <span className="text-xs font-mono text-zinc-400">
                      {formatTime(song.duration)}
                    </span>
                  ) : null}

                  <button
                    onClick={() => handleRemove(song.id)}
                    aria-label="Remove from playlist"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
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

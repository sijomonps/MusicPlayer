"use client";

import React, { useState } from "react";
import {
  ListMusic,
  Plus,
  MoreHorizontal,
  Edit2,
  Trash2,
  Play,
  X,
} from "lucide-react";
import { Playlist, Song } from "@/lib/types";
import { useLibrary } from "@/lib/library-context";

interface PlaylistListProps {
  onSelectPlaylist: (playlist: Playlist) => void;
}

export function PlaylistList({ onSelectPlaylist }: PlaylistListProps) {
  const {
    playlists,
    playlistSongsMap,
    songs,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
  } = useLibrary();

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const [menuId, setMenuId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    try {
      const created = await createPlaylist(title);
      setNewTitle("");
      setIsCreating(false);
      onSelectPlaylist(created);
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRename = async (id: string) => {
    const title = editTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    try {
      await renamePlaylist(id, title);
      setEditingId(null);
      setMenuId(null);
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete playlist "${name}"? Tracks in library will remain.`)) {
      await deletePlaylist(id);
      setMenuId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold tracking-tight text-white">
            Playlists
          </h2>
          <span className="text-xs font-mono text-zinc-500">
            {playlists.length}
          </span>
        </div>

        <button
          onClick={() => {
            setIsCreating(true);
            setMenuId(null);
          }}
          className="h-8 px-3.5 rounded-full bg-white text-black text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>New</span>
        </button>
      </div>

      {/* Inline Minimal Creator */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] space-y-2.5 animate-fade-in-up"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              New Playlist
            </span>
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="text-zinc-500 hover:text-white p-1 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Playlist name"
              autoFocus
              required
              className="flex-1 h-8 px-3 rounded-full text-xs bg-white/[0.05] border border-white/[0.1] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/20 transition-all"
            />
            <button
              type="submit"
              className="h-8 px-4 rounded-full bg-white text-black text-xs font-semibold active:scale-95 transition-all cursor-pointer shrink-0"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* Empty State */}
      {playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <ListMusic className="w-8 h-8 text-zinc-600 stroke-1 mb-2.5" />
          <p className="text-xs font-medium text-zinc-400">No playlists</p>
          <button
            onClick={() => setIsCreating(true)}
            className="mt-3 px-3.5 py-1.5 rounded-full bg-white text-black text-xs font-semibold active:scale-95 transition-all cursor-pointer"
          >
            + New
          </button>
        </div>
      ) : (
        /* Bento Card Grid (2 cols mobile, 3 sm, 4 md) */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {playlists.map((pl) => {
            const songIds = playlistSongsMap[pl.id] || [];
            const plSongs = songIds
              .map((id) => songs.find((s) => s.id === id))
              .filter((s): s is Song => Boolean(s));
            const artworks = plSongs
              .map((s) => s.artwork_url)
              .filter((url): url is string => Boolean(url))
              .slice(0, 4);

            const isMenuOpen = menuId === pl.id;
            const isEditing = editingId === pl.id;

            return (
              <div
                key={pl.id}
                onClick={() => onSelectPlaylist(pl)}
                className="group relative flex flex-col p-2.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] hover:border-white/[0.1] active:scale-[0.98] transition-all duration-200 cursor-pointer"
              >
                {/* Artwork Square Preview / 2x2 Collage */}
                <div className="aspect-square w-full rounded-xl overflow-hidden relative bg-white/[0.03] border border-white/[0.06] mb-2">
                  {artworks.length >= 4 ? (
                    <div className="grid grid-cols-2 grid-rows-2 w-full h-full">
                      {artworks.slice(0, 4).map((url, idx) => (
                        <img
                          key={idx}
                          src={url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ))}
                    </div>
                  ) : artworks.length > 0 ? (
                    <img
                      src={artworks[0]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-zinc-800/80 to-zinc-950 flex items-center justify-center text-zinc-600">
                      <ListMusic className="w-8 h-8 stroke-1" />
                    </div>
                  )}

                  {/* Floating Play Indicator */}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-9 h-9 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </div>
                  </div>
                </div>

                {/* Metadata & Menu */}
                {isEditing ? (
                  <div
                    className="space-y-1.5 pt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(pl.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-full px-2 py-1 rounded-lg text-xs bg-white/[0.08] border border-white/20 text-white focus:outline-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2 py-0.5 rounded text-[10px] text-zinc-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRename(pl.id)}
                        className="px-2.5 py-0.5 rounded text-[10px] bg-white text-black font-semibold"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5 px-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <h3 className="text-xs sm:text-sm font-semibold text-white truncate">
                        {pl.name}
                      </h3>

                      <div
                        className="relative"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setMenuId(isMenuOpen ? null : pl.id)}
                          aria-label="Playlist options"
                          className="p-1 -mr-1 rounded-md text-zinc-500 hover:text-white transition-colors cursor-pointer"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {isMenuOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-20 cursor-default"
                              onClick={() => setMenuId(null)}
                            />
                            <div className="absolute right-0 bottom-full mb-1 w-28 rounded-xl bg-zinc-900 border border-white/10 shadow-2xl py-1 z-30">
                              <button
                                onClick={() => {
                                  setEditingId(pl.id);
                                  setEditTitle(pl.name);
                                  setMenuId(null);
                                }}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                              >
                                <Edit2 className="w-3 h-3 text-zinc-400" />
                                <span>Rename</span>
                              </button>
                              <button
                                onClick={() => handleDelete(pl.id, pl.name)}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3 text-red-400" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-[11px] font-mono text-zinc-500">
                      {songIds.length} {songIds.length === 1 ? "track" : "tracks"}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

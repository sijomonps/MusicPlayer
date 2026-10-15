"use client";

import React, { useState } from "react";
import { ListMusic, Plus, MoreVertical, Edit2, Trash2, FolderPlus } from "lucide-react";
import { Playlist } from "@/lib/types";
import { useLibrary } from "@/lib/library-context";

interface PlaylistListProps {
  onSelectPlaylist: (playlist: Playlist) => void;
}

export function PlaylistList({ onSelectPlaylist }: PlaylistListProps) {
  const { playlists, createPlaylist, renamePlaylist, deletePlaylist } = useLibrary();

  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  const [menuId, setMenuId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const created = await createPlaylist(newTitle.trim(), newDesc.trim() || undefined);
      setNewTitle("");
      setNewDesc("");
      setIsCreating(false);
      onSelectPlaylist(created);
    } catch (err: unknown) {
      alert("Error creating playlist: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleRename = async (id: string) => {
    if (!editTitle.trim()) return;
    try {
      await renamePlaylist(id, editTitle.trim());
      setEditingId(null);
      setMenuId(null);
    } catch (err: unknown) {
      alert("Error renaming playlist: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Delete playlist "${name}"? Songs in your library will not be deleted.`)) {
      await deletePlaylist(id);
      setMenuId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Playlists
          </h2>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {playlists.length} {playlists.length === 1 ? "playlist" : "playlists"}
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 text-xs sm:text-sm font-medium hover:opacity-90 active:scale-95 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>New Playlist</span>
        </button>
      </div>

      {/* Inline Create Form */}
      {isCreating && (
        <form
          onSubmit={handleCreate}
          className="p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-3"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Create Playlist
          </h3>
          <div className="space-y-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Playlist Title"
              autoFocus
              required
              className="w-full px-3 py-2 rounded-xl text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Description (Optional)"
              className="w-full px-3 py-2 rounded-xl text-sm bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90"
            >
              Create
            </button>
          </div>
        </form>
      )}

      {/* Playlists Grid */}
      {playlists.length === 0 ? (
        <div className="text-center py-16 px-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <FolderPlus className="w-10 h-10 mx-auto text-zinc-400 stroke-1 mb-3" />
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            No playlists yet
          </h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mt-1 mb-4">
            Create playlists to organize your favorite songs, focus albums, or workout mixes.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 text-xs font-medium hover:opacity-90 transition-opacity"
          >
            Create Playlist
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => onSelectPlaylist(pl)}
              className="group relative flex flex-col justify-between p-4 rounded-2xl bg-zinc-50/70 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-100/80 dark:hover:bg-zinc-900 cursor-pointer transition-all duration-200"
            >
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-zinc-200/70 dark:bg-zinc-800 flex items-center justify-center text-zinc-600 dark:text-zinc-300 mb-3 group-hover:scale-105 transition-transform">
                  <ListMusic className="w-5 h-5" />
                </div>

                <div className="relative" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => setMenuId(menuId === pl.id ? null : pl.id)}
                    aria-label="Playlist options"
                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {menuId === pl.id && (
                    <div className="absolute right-0 top-full mt-1 w-36 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl py-1 z-30">
                      <button
                        onClick={() => {
                          setEditingId(pl.id);
                          setEditTitle(pl.name);
                          setMenuId(null);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Rename
                      </button>
                      <button
                        onClick={() => handleDelete(pl.id, pl.name)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {editingId === pl.id ? (
                <div
                  className="space-y-2 mt-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                    className="w-full px-2.5 py-1.5 rounded-lg text-sm bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-zinc-900 dark:text-zinc-100"
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2.5 py-1 text-xs text-zinc-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRename(pl.id)}
                      className="px-3 py-1 text-xs bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 rounded-md"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {pl.name}
                  </h3>
                  {pl.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5">
                      {pl.description}
                    </p>
                  )}
                  <p className="text-xs text-zinc-400 mt-2 font-mono">
                    {pl.song_count || 0} {(pl.song_count || 0) === 1 ? "track" : "tracks"}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

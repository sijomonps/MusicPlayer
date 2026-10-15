"use client";

import React from "react";
import { Music, ListMusic, PlusCircle } from "lucide-react";

interface BottomNavProps {
  currentTab: "songs" | "playlists";
  onTabChange: (tab: "songs" | "playlists") => void;
  onOpenAddModal: () => void;
}

export function BottomNav({
  currentTab,
  onTabChange,
  onOpenAddModal,
}: BottomNavProps) {
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md border-t border-zinc-200 dark:border-zinc-800 pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-3 h-16 items-center px-4">
        <button
          onClick={() => onTabChange("songs")}
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-colors ${
            currentTab === "songs"
              ? "text-zinc-950 dark:text-zinc-50 font-medium"
              : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          }`}
        >
          <Music className="w-5 h-5" />
          <span className="text-[11px]">Songs</span>
        </button>

        <button
          onClick={onOpenAddModal}
          className="flex flex-col items-center justify-center gap-1 py-1 text-zinc-600 dark:text-zinc-300 active:scale-95 transition-transform"
        >
          <PlusCircle className="w-6 h-6 stroke-[1.75]" />
          <span className="text-[11px]">Add Music</span>
        </button>

        <button
          onClick={() => onTabChange("playlists")}
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-colors ${
            currentTab === "playlists"
              ? "text-zinc-950 dark:text-zinc-50 font-medium"
              : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          }`}
        >
          <ListMusic className="w-5 h-5" />
          <span className="text-[11px]">Playlists</span>
        </button>
      </div>
    </div>
  );
}

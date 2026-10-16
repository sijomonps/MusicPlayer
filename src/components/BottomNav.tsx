"use client";

import React from "react";
import { Music, ListMusic, Plus } from "lucide-react";

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
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#060608]/90 backdrop-blur-2xl border-t border-white/[0.06] pb-[env(safe-area-inset-bottom,0px)]">
      <div className="grid grid-cols-3 h-14 items-center px-6 max-w-sm mx-auto">
        {/* Tracks */}
        <button
          onClick={() => onTabChange("songs")}
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 duration-150 ${
            currentTab === "songs"
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Music className="w-4 h-4 stroke-[2.2]" />
          <span className="text-[10px] font-medium tracking-tight">Tracks</span>
        </button>

        {/* Add */}
        <button
          onClick={onOpenAddModal}
          className="flex flex-col items-center justify-center gap-1 py-1 text-zinc-300 hover:text-white transition-all active:scale-90 duration-150"
        >
          <div className="w-7 h-7 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-white">
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          </div>
          <span className="text-[10px] font-medium tracking-tight">Add</span>
        </button>

        {/* Playlists */}
        <button
          onClick={() => onTabChange("playlists")}
          className={`flex flex-col items-center justify-center gap-1 py-1 transition-all active:scale-95 duration-150 ${
            currentTab === "playlists"
              ? "text-white"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <ListMusic className="w-4 h-4 stroke-[2.2]" />
          <span className="text-[10px] font-medium tracking-tight">Playlists</span>
        </button>
      </div>
    </nav>
  );
}

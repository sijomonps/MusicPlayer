"use client";

import React from "react";
import { Music, ListMusic, Plus } from "lucide-react";
import { SijomonsLogo } from "./icons/SijomonsLogo";
import { StorageStatsBar } from "./StorageStatsBar";
import { useLibrary } from "@/lib/library-context";

interface SidebarProps {
  currentTab: "songs" | "playlists";
  onTabChange: (tab: "songs" | "playlists") => void;
  onOpenAddModal: () => void;
}

export function Sidebar({ currentTab, onTabChange, onOpenAddModal }: SidebarProps) {
  const { playlists, songs } = useLibrary();

  return (
    <aside className="hidden md:flex flex-col justify-between w-60 border-r border-white/[0.06] bg-[#060608] p-5 h-screen sticky top-0 shrink-0">
      <div className="space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-7 h-7 flex items-center justify-center text-white">
            <SijomonsLogo className="w-5 h-5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">
            Sijomons Music
          </span>
        </div>

        {/* Quick Add Button */}
        <button
          onClick={onOpenAddModal}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-white text-black text-xs font-semibold hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-xs"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Add Music</span>
        </button>

        {/* Navigation Menu */}
        <nav className="space-y-1">
          <button
            onClick={() => onTabChange("songs")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              currentTab === "songs"
                ? "bg-white/[0.08] text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Music className="w-3.5 h-3.5" />
              <span>Tracks</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              {songs.length}
            </span>
          </button>

          <button
            onClick={() => onTabChange("playlists")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              currentTab === "playlists"
                ? "bg-white/[0.08] text-white"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ListMusic className="w-3.5 h-3.5" />
              <span>Playlists</span>
            </div>
            <span className="text-[10px] font-mono text-zinc-500">
              {playlists.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Footer Storage Indicator */}
      <div className="pt-4 border-t border-white/[0.06] px-1">
        <StorageStatsBar variant="bar" />
      </div>
    </aside>
  );
}

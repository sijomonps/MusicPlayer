"use client";

import React from "react";
import { Music, ListMusic, Plus, Cloud, HardDrive, LogIn, User } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useLibrary } from "@/lib/library-context";
import { useAuth } from "@/lib/auth-context";

interface SidebarProps {
  currentTab: "songs" | "playlists";
  onTabChange: (tab: "songs" | "playlists") => void;
  onOpenAddModal: () => void;
  onOpenAuthModal: () => void;
}

export function Sidebar({
  currentTab,
  onTabChange,
  onOpenAddModal,
  onOpenAuthModal,
}: SidebarProps) {
  const { isCloudSync, playlists } = useLibrary();
  const { user } = useAuth();

  return (
    <aside className="hidden md:flex flex-col justify-between w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 h-screen sticky top-0 shrink-0">
      <div className="space-y-6">
        {/* App Title */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-zinc-100 dark:text-zinc-900">
              <Music className="w-4 h-4 stroke-[2.5]" />
            </div>
            <span className="text-base font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Minimal Player
            </span>
          </div>
          <ThemeToggle />
        </div>

        {/* Action Button */}
        <button
          onClick={onOpenAddModal}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all shadow-xs"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Music</span>
        </button>

        {/* Navigation Menu */}
        <nav className="space-y-1">
          <button
            onClick={() => onTabChange("songs")}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              currentTab === "songs"
                ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
            }`}
          >
            <Music className="w-4 h-4" />
            <span>All Songs</span>
          </button>

          <button
            onClick={() => onTabChange("playlists")}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              currentTab === "playlists"
                ? "bg-zinc-100 dark:bg-zinc-900 text-zinc-950 dark:text-zinc-50"
                : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
            }`}
          >
            <div className="flex items-center gap-3">
              <ListMusic className="w-4 h-4" />
              <span>Playlists</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-200/60 dark:bg-zinc-800 text-zinc-500 font-mono">
              {playlists.length}
            </span>
          </button>
        </nav>
      </div>

      {/* Footer Status & Auth Trigger */}
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/80 space-y-2">
        <button
          onClick={onOpenAuthModal}
          className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors text-left"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {isCloudSync ? (
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                <Cloud className="w-3.5 h-3.5" />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-500 flex items-center justify-center shrink-0">
                <HardDrive className="w-3.5 h-3.5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {isCloudSync ? user?.email || "Cloud Connected" : "Local Storage"}
              </p>
              <p className="text-[10px] text-zinc-400 truncate">
                {isCloudSync ? "Supabase Active" : "Click to Sign In & Sync"}
              </p>
            </div>
          </div>
          {isCloudSync ? (
            <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          ) : (
            <LogIn className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
        </button>
      </div>
    </aside>
  );
}

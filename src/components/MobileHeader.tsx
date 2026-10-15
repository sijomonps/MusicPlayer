"use client";

import React from "react";
import { Music, Cloud, HardDrive, Plus } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useLibrary } from "@/lib/library-context";

interface MobileHeaderProps {
  onOpenAddModal: () => void;
}

export function MobileHeader({ onOpenAddModal }: MobileHeaderProps) {
  const { isCloudSync } = useLibrary();

  return (
    <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md sticky top-0 z-30 pt-[env(safe-area-inset-top,0.75rem)]">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center text-zinc-100 dark:text-zinc-900">
          <Music className="w-3.5 h-3.5 stroke-[2.5]" />
        </div>
        <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          Minimal
        </span>
        <div className="flex items-center text-[10px] text-zinc-400 gap-1 ml-1">
          {isCloudSync ? (
            <Cloud className="w-3 h-3 text-emerald-500" />
          ) : (
            <HardDrive className="w-3 h-3 text-zinc-400" />
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={onOpenAddModal}
          aria-label="Add music"
          className="p-2 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}

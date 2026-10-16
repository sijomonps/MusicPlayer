"use client";

import React from "react";
import { Plus } from "lucide-react";
import { SijomonsLogo } from "./icons/SijomonsLogo";
import { StorageStatsBar } from "./StorageStatsBar";

interface MobileHeaderProps {
  onOpenAddModal: () => void;
}

export function MobileHeader({ onOpenAddModal }: MobileHeaderProps) {
  return (
    <header className="md:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-[#060608]/85 backdrop-blur-2xl border-b border-white/[0.06] pt-[env(safe-area-inset-top,0px)]">
      {/* Brand: Logo + Monogram Title */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 flex items-center justify-center text-white">
          <SijomonsLogo className="w-5 h-5" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-white">
          Sijomons Music
        </span>
      </div>

      {/* Actions: Minimal Storage Pill + Circular Add Button */}
      <div className="flex items-center gap-2">
        <StorageStatsBar variant="pill" />

        <button
          onClick={onOpenAddModal}
          aria-label="Add music"
          className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center active:scale-90 transition-transform shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>
    </header>
  );
}

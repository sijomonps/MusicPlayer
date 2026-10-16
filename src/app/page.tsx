"use client";

import React, { useState } from "react";
import { AudioProvider } from "@/lib/audio-context";
import { LibraryProvider, useLibrary } from "@/lib/library-context";
import { Sidebar } from "@/components/Sidebar";
import { MobileHeader } from "@/components/MobileHeader";
import { BottomNav } from "@/components/BottomNav";
import { BottomPlayer } from "@/components/BottomPlayer";
import { SongList } from "@/components/SongList";
import { PlaylistList } from "@/components/PlaylistList";
import { PlaylistDetail } from "@/components/PlaylistDetail";
import { AddMusicModal } from "@/components/AddMusicModal";
import { Playlist } from "@/lib/types";

function MainContent() {
  const { songs } = useLibrary();
  const [currentTab, setCurrentTab] = useState<"songs" | "playlists">("songs");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[#060608] text-zinc-100 overflow-hidden font-sans select-none">
      {/* Desktop Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={(tab) => {
          setSelectedPlaylist(null);
          setCurrentTab(tab);
        }}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <MobileHeader onOpenAddModal={() => setIsAddModalOpen(true)} />

        {/* Scrollable Content Container */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 pb-36 md:pb-28 no-scrollbar">
          <div className="max-w-4xl mx-auto animate-fade-in-up">
            {selectedPlaylist ? (
              <PlaylistDetail
                playlist={selectedPlaylist}
                onBack={() => setSelectedPlaylist(null)}
                onOpenAddModal={() => setIsAddModalOpen(true)}
              />
            ) : currentTab === "songs" ? (
              <SongList
                songs={songs}
                onOpenAddModal={() => setIsAddModalOpen(true)}
              />
            ) : (
              <PlaylistList
                onSelectPlaylist={(pl) => setSelectedPlaylist(pl)}
              />
            )}
          </div>
        </main>
      </div>

      {/* Persistent Bottom Audio Player */}
      <BottomPlayer />

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        currentTab={currentTab}
        onTabChange={(tab) => {
          setSelectedPlaylist(null);
          setCurrentTab(tab);
        }}
        onOpenAddModal={() => setIsAddModalOpen(true)}
      />

      {/* Add Music Modal */}
      <AddMusicModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
}

export default function Home() {
  return (
    <LibraryProvider>
      <AudioProvider>
        <MainContent />
      </AudioProvider>
    </LibraryProvider>
  );
}

"use client";

import React, { useState } from "react";
import { AuthProvider } from "@/lib/auth-context";
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
import { AuthModal } from "@/components/AuthModal";
import { Playlist } from "@/lib/types";

function MainContent() {
  const { songs } = useLibrary();
  const [currentTab, setCurrentTab] = useState<"songs" | "playlists">("songs");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onTabChange={(tab) => {
          setSelectedPlaylist(null);
          setCurrentTab(tab);
        }}
        onOpenAddModal={() => setIsAddModalOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      {/* Main View Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <MobileHeader
          onOpenAddModal={() => setIsAddModalOpen(true)}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
        />

        {/* Scrollable Content Container */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 pb-36 md:pb-28">
          <div className="max-w-4xl mx-auto">
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

      {/* Auth Modal for Supabase Session */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <LibraryProvider>
        <AudioProvider>
          <MainContent />
        </AudioProvider>
      </LibraryProvider>
    </AuthProvider>
  );
}

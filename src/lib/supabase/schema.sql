-- ====================================================================
-- Supabase Database Schema for Sijomons Music Player
-- Multi-Device Sync & Passcode-Free Architecture
-- Run this script in your Supabase Project Dashboard > SQL Editor
-- ====================================================================

-- 1. Create songs table (TEXT primary key supports both UUIDs & custom IDs)
CREATE TABLE IF NOT EXISTS public.songs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id UUID,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT 'Unknown Artist',
    album TEXT,
    duration NUMERIC,
    audio_url TEXT NOT NULL,
    storage_path TEXT,
    r2_key TEXT, -- Legacy key for backward compatibility
    artwork_url TEXT,
    source_type TEXT NOT NULL DEFAULT 'upload',
    youtube_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create playlists table
CREATE TABLE IF NOT EXISTS public.playlists (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create playlist_songs join table for ordering
CREATE TABLE IF NOT EXISTS public.playlist_songs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    playlist_id TEXT NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    song_id TEXT NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(playlist_id, song_id)
);

-- Migration safety for existing installations:
-- Safely alter columns from UUID to TEXT if table was previously created with UUID primary keys
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'songs' AND data_type = 'uuid' AND column_name = 'id'
  ) THEN
    ALTER TABLE public.playlist_songs DROP CONSTRAINT IF EXISTS playlist_songs_song_id_fkey;
    ALTER TABLE public.playlist_songs DROP CONSTRAINT IF EXISTS playlist_songs_playlist_id_fkey;
    ALTER TABLE public.songs ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.playlists ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.playlist_songs ALTER COLUMN song_id TYPE TEXT;
    ALTER TABLE public.playlist_songs ALTER COLUMN playlist_id TYPE TEXT;
    ALTER TABLE public.playlist_songs ALTER COLUMN id TYPE TEXT;
    ALTER TABLE public.playlist_songs ADD CONSTRAINT playlist_songs_song_id_fkey 
        FOREIGN KEY (song_id) REFERENCES public.songs(id) ON DELETE CASCADE;
    ALTER TABLE public.playlist_songs ADD CONSTRAINT playlist_songs_playlist_id_fkey 
        FOREIGN KEY (playlist_id) REFERENCES public.playlists(id) ON DELETE CASCADE;
  END IF;

  -- Ensure source_type constraint supports youtube_extracted
  ALTER TABLE public.songs DROP CONSTRAINT IF EXISTS songs_source_type_check;
  ALTER TABLE public.songs ADD CONSTRAINT songs_source_type_check 
      CHECK (source_type IN ('upload', 'direct_url', 'youtube_bookmark', 'youtube_extracted'));

  -- Ensure user_id is nullable (auth is not required)
  ALTER TABLE public.songs ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE public.playlists ALTER COLUMN user_id DROP NOT NULL;
END $$;

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON public.songs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlists_created_at ON public.playlists(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_id ON public.playlist_songs(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_position ON public.playlist_songs(playlist_id, position ASC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;

-- 5. Drop any old user-specific RLS policies
DROP POLICY IF EXISTS "Users can view their own songs or public demo songs" ON public.songs;
DROP POLICY IF EXISTS "Users can view their own songs" ON public.songs;
DROP POLICY IF EXISTS "Users can insert their own songs" ON public.songs;
DROP POLICY IF EXISTS "Users can update their own songs" ON public.songs;
DROP POLICY IF EXISTS "Users can delete their own songs" ON public.songs;
DROP POLICY IF EXISTS "Public read songs" ON public.songs;
DROP POLICY IF EXISTS "Public insert songs" ON public.songs;
DROP POLICY IF EXISTS "Public update songs" ON public.songs;
DROP POLICY IF EXISTS "Public delete songs" ON public.songs;

DROP POLICY IF EXISTS "Users can view their own playlists" ON public.playlists;
DROP POLICY IF EXISTS "Users can insert their own playlists" ON public.playlists;
DROP POLICY IF EXISTS "Users can update their own playlists" ON public.playlists;
DROP POLICY IF EXISTS "Users can delete their own playlists" ON public.playlists;
DROP POLICY IF EXISTS "Public read playlists" ON public.playlists;
DROP POLICY IF EXISTS "Public insert playlists" ON public.playlists;
DROP POLICY IF EXISTS "Public update playlists" ON public.playlists;
DROP POLICY IF EXISTS "Public delete playlists" ON public.playlists;

DROP POLICY IF EXISTS "Users can view songs in their playlists" ON public.playlist_songs;
DROP POLICY IF EXISTS "Users can insert songs into their playlists" ON public.playlist_songs;
DROP POLICY IF EXISTS "Users can update song order in their playlists" ON public.playlist_songs;
DROP POLICY IF EXISTS "Users can delete songs from their playlists" ON public.playlist_songs;
DROP POLICY IF EXISTS "Public read playlist_songs" ON public.playlist_songs;
DROP POLICY IF EXISTS "Public insert playlist_songs" ON public.playlist_songs;
DROP POLICY IF EXISTS "Public update playlist_songs" ON public.playlist_songs;
DROP POLICY IF EXISTS "Public delete playlist_songs" ON public.playlist_songs;

-- 6. Passcode-Free / Personal Library RLS Policies
-- Allows full reading and syncing across all personal devices using the public anon key.
CREATE POLICY "Public read songs" ON public.songs FOR SELECT USING (true);
CREATE POLICY "Public insert songs" ON public.songs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update songs" ON public.songs FOR UPDATE USING (true);
CREATE POLICY "Public delete songs" ON public.songs FOR DELETE USING (true);

CREATE POLICY "Public read playlists" ON public.playlists FOR SELECT USING (true);
CREATE POLICY "Public insert playlists" ON public.playlists FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update playlists" ON public.playlists FOR UPDATE USING (true);
CREATE POLICY "Public delete playlists" ON public.playlists FOR DELETE USING (true);

CREATE POLICY "Public read playlist_songs" ON public.playlist_songs FOR SELECT USING (true);
CREATE POLICY "Public insert playlist_songs" ON public.playlist_songs FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update playlist_songs" ON public.playlist_songs FOR UPDATE USING (true);
CREATE POLICY "Public delete playlist_songs" ON public.playlist_songs FOR DELETE USING (true);

-- 7. Supabase Storage Bucket ("songs")
INSERT INTO storage.buckets (id, name, public) 
VALUES ('songs', 'songs', true)
ON CONFLICT (id) DO NOTHING;

-- 8. Enable Realtime Replication for instant multi-device syncing
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.songs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.playlists;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.playlist_songs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

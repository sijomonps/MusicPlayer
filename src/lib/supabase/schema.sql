-- ====================================================================
-- Supabase Database Schema for Minimal Music Player
-- Run this script in your Supabase Project Dashboard > SQL Editor
-- ====================================================================

-- 1. Create songs table
CREATE TABLE IF NOT EXISTS public.songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT 'Unknown Artist',
    album TEXT,
    duration NUMERIC,
    audio_url TEXT NOT NULL,
    r2_key TEXT,
    artwork_url TEXT,
    source_type TEXT NOT NULL DEFAULT 'upload' CHECK (source_type IN ('upload', 'direct_url', 'youtube_bookmark')),
    youtube_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create playlists table
CREATE TABLE IF NOT EXISTS public.playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create playlist_songs join table for ordering
CREATE TABLE IF NOT EXISTS public.playlist_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    song_id UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(playlist_id, song_id)
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_songs_user_id ON public.songs(user_id);
CREATE INDEX IF NOT EXISTS idx_songs_created_at ON public.songs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_playlists_user_id ON public.playlists(user_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_id ON public.playlist_songs(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_songs_position ON public.playlist_songs(playlist_id, position ASC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_songs ENABLE ROW LEVEL SECURITY;

-- 5. Drop existing policies if they exist (idempotent migration)
DROP POLICY IF EXISTS "Users can view their own songs or public demo songs" ON public.songs;
DROP POLICY IF EXISTS "Users can view their own songs" ON public.songs;
DROP POLICY IF EXISTS "Users can insert their own songs" ON public.songs;
DROP POLICY IF EXISTS "Users can update their own songs" ON public.songs;
DROP POLICY IF EXISTS "Users can delete their own songs" ON public.songs;

DROP POLICY IF EXISTS "Users can view their own playlists" ON public.playlists;
DROP POLICY IF EXISTS "Users can insert their own playlists" ON public.playlists;
DROP POLICY IF EXISTS "Users can update their own playlists" ON public.playlists;
DROP POLICY IF EXISTS "Users can delete their own playlists" ON public.playlists;

DROP POLICY IF EXISTS "Users can view songs in their playlists" ON public.playlist_songs;
DROP POLICY IF EXISTS "Users can insert songs into their playlists" ON public.playlist_songs;
DROP POLICY IF EXISTS "Users can update song order in their playlists" ON public.playlist_songs;
DROP POLICY IF EXISTS "Users can delete songs from their playlists" ON public.playlist_songs;

-- 6. Clean up any unauthenticated orphaned test rows
DELETE FROM public.playlist_songs WHERE playlist_id IN (SELECT id FROM public.playlists WHERE user_id IS NULL);
DELETE FROM public.playlists WHERE user_id IS NULL;
DELETE FROM public.songs WHERE user_id IS NULL;

-- 7. RLS Policies for songs (Private per user)
CREATE POLICY "Users can view their own songs"
    ON public.songs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own songs"
    ON public.songs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own songs"
    ON public.songs FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own songs"
    ON public.songs FOR DELETE
    USING (auth.uid() = user_id);

-- 8. RLS Policies for playlists (Private per user)
CREATE POLICY "Users can view their own playlists"
    ON public.playlists FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own playlists"
    ON public.playlists FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own playlists"
    ON public.playlists FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own playlists"
    ON public.playlists FOR DELETE
    USING (auth.uid() = user_id);

-- 9. RLS Policies for playlist_songs (Strict ownership via parent playlist)
CREATE POLICY "Users can view songs in their playlists"
    ON public.playlist_songs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = playlist_songs.playlist_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert songs into their playlists"
    ON public.playlist_songs FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = playlist_songs.playlist_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update song order in their playlists"
    ON public.playlist_songs FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = playlist_songs.playlist_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete songs from their playlists"
    ON public.playlist_songs FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = playlist_songs.playlist_id
            AND p.user_id = auth.uid()
        )
    );

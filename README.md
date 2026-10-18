# Sijomons Music

An ultra-minimal, animated, mobile-first web app built with **Next.js 16 (App Router)**, **React 19**, **Supabase Database & Storage**, and **Tailwind CSS 4**. Designed for effortless single-handed use on **iPhone 12 mini** through Safari, with continuous **lock-screen background playback** and **instant multi-device sync**.

---

## Features

- **Multi-Device Realtime Sync**:
  - Supabase Database is the main source of truth (`songs`, `playlists`, `playlist_songs`).
  - Realtime subscriptions push live updates across all open browsers and devices without manual refresh.
  - Automatic one-time safe migration from legacy `localStorage` with zero data loss or duplicates.
- **Passcode-Free Uploads**:
  - No passcode modals, tokens, or friction.
  - Server-side security includes strict 50 MB limit, audio MIME validation, safe relative path traversal checks, and IP rate limiting (60 req/min for uploads, 30 req/min for extractions).
  - `SUPABASE_SERVICE_ROLE_KEY` is kept strictly on the server; client queries use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- **Zero Local Cache Policy**:
  - Audio files strictly stream from Supabase CDN and are never accumulated in browser Cache Storage.
  - Dynamic API routes use `Cache-Control: no-store, max-age=0`.
  - Cache Storage and lingering service workers are cleared on app mount.
  - Persistent `<audio>` element uses `preload="none"`.
- **iPhone Background Playback**:
  - Music continues playing uninterrupted when your iPhone screen is locked.
  - Single persistent `<audio>` element preserves active iOS Safari audio session.
  - Lock-screen metadata (artwork, title, artist) and controls (play, pause, next, prev, scrub) via the standard Media Session API.
- **Add Music**:
  - **File Uploads**: MP3, M4A, AAC, WAV, FLAC, OGG up to 50 MB uploaded directly to Supabase Storage.
  - **YouTube Extraction**: Extracts audio with yt-dlp, automatically bypassing bot challenges using browser cookies / `cookies.txt` and android/web player client args.
  - **Direct Audio URLs**: Streamable web links added straight to library.
  - **Playlist Assignment**: Select or create a playlist on-the-fly directly inside the Add Music modal.
- **Ultra-Minimal UI**:
  - Dark glassmorphic aesthetic optimized for iPhone 12 mini.
  - Floating mini player pill above bottom nav and animated full-screen player sheet.
  - Three-bar animated equalizer on active track rows.

---

## Getting Started

### 1. Database Setup

Run the SQL script located at `src/lib/supabase/schema.sql` in your **Supabase Dashboard > SQL Editor**:
- Creates `songs`, `playlists`, and `playlist_songs` tables with `TEXT` primary keys.
- Adds Row Level Security (RLS) policies allowing public personal access via the anon key.
- Enables Supabase Realtime replication on `songs`, `playlists`, and `playlist_songs`.
- Configures the `songs` public storage bucket.

### 2. Environment Variables

Create `.env.local` using `.env.example`:

```bash
cp .env.example .env.local
```

Fill in your Supabase project credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
SUPABASE_STORAGE_BUCKET=songs
```

### 3. Run Development Server

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your desktop or iPhone Safari.

---

## Running Tests and Linting

```bash
# Run unit tests (25 tests covering storage, security, rate limiting, and link parsing)
npm run test

# Run ESLint
npm run lint

# Production build
npm run build
```

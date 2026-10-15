# Minimal Music Player

A minimal, lightweight cloud music player built with **Next.js (App Router)**, **TypeScript**, and **Tailwind CSS**. Designed specifically for single-handed use on **iPhone 12 mini** through Safari, with continuous **lock-screen background playback**.

---

## Features

- **iPhone Background Playback**: Keeps playing when your screen is locked. Includes lock-screen metadata (artwork, title, artist) and controls (play, pause, next, prev, seek) via the Media Session API.
- **Single Persistent Audio Element**: Avoids creating new `<audio>` elements across songs, preserving the active iOS Safari audio session in the background.
- **HTTP Range Requests (206 Partial Content)**: Cloudflare R2 audio streaming route supports byte ranges, enabling seeking and duration tracking on iOS Safari.
- **Add Music**:
  - **YouTube Link**: Saved as a quick-access bookmark with fetched metadata (title, author, thumbnail). *No audio is extracted or downloaded.*
  - **Direct Stream (MP3, M4A, AAC, WAV, FLAC)**: Added directly to your streaming library.
  - **Upload to Cloudflare R2**: Upload owned/permitted audio files (up to 50 MB) directly to cloud storage.
- **Playlists**:
  - Create and rename playlists.
  - Add or remove tracks.
  - Reorder songs using drag-and-drop or one-touch **Move Up / Down** buttons optimized for iPhone 12 mini thumb reach.
  - Automatic persistence to Supabase with Row Level Security (RLS).
- **Minimal & Premium UI**:
  - Dark mode by default (high contrast, OLED-friendly).
  - Responsive layout (desktop sidebar + mobile bottom navigation).
  - Expandable full-screen player with large scrubber and queue.
  - Fallback local mode: Operates out-of-the-box with preloaded sample tracks even before configuring cloud keys.

---

## iPhone Safari Background Playback & Technical Notes

### How Screen-Lock Background Playback Works
1. **Persistent `<audio>` Element**: iOS Safari suspends or denies audio playback if a new `<audio>` DOM node is instantiated while the device is locked or the tab is backgrounded. Minimal Player uses a single, persistent `<audio>` element mounted once in the app root.
2. **Auto-Advance on Lock Screen**: When a track finishes, the `ended` event listener on the persistent audio element synchronously switches `audio.src` to the next track and calls `audio.play()`. Because this occurs inside the active playback event loop, iOS Safari permits the continuous playback without interruption.
3. **Media Session API**: Lock-screen playback controls (`play`, `pause`, `previoustrack`, `nexttrack`, `seekto`, `seekbackward`, `seekforward`) and metadata are registered via `navigator.mediaSession`.
4. **HTTP Range Requests (`206 Partial Content`)**: iOS Safari requires servers to respond with `206 Partial Content` and `Accept-Ranges: bytes` when streaming audio. If a server responds with `200 OK`, Safari cannot reliably scrub or display the total duration, often terminating playback. The `/api/stream?key=...` endpoint handles byte-range requests for Cloudflare R2.

### iOS Safari Limitations & Honest Quirks
- **Initial User Gesture**: Safari prohibits autoplay without an initial user touch. You must tap play at least once after opening the website.
- **Volume Controls**: Apple disables programmatic volume control (`audio.volume = x`) on iOS Safari. Volume must be adjusted via the physical iPhone volume buttons.
- **Safari Memory Eviction**: If you leave the locked phone playing for many hours or open dozens of heavy tabs, iOS Safari may evict the tab from memory if system RAM runs low. Minimal Player is kept lightweight with zero bloated client libraries to prevent this.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide Icons
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Storage**: Cloudflare R2 (S3-compatible object storage)
- **Deployment**: Vercel

---

## Getting Started

### 1. Clone & Install Dependencies

```bash
git clone <your-repo-url>
cd MusicPlayer
npm install
```

### 2. Configure Environment Variables

Copy the example file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials (see below for configuration steps).

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your desktop or iPhone (via local network IP).

---

## Supabase Database Setup

1. Create a free project at [supabase.com](https://supabase.com).
2. In the Supabase Dashboard, go to the **SQL Editor**.
3. Open `src/lib/supabase/schema.sql` from this repository, copy its contents, and run it.
4. This script sets up:
   - `songs` table
   - `playlists` table
   - `playlist_songs` table (with position indexing for custom ordering)
   - Row Level Security (RLS) policies
5. Go to **Project Settings > API** and copy:
   - `Project URL` -> `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key -> `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key -> `SUPABASE_SERVICE_ROLE_KEY`

---

## Cloudflare R2 Setup

1. Sign up at [cloudflare.com](https://cloudflare.com) and go to **R2**.
2. Click **Create bucket** (e.g. `music-player-audio`).
3. Under **Manage R2 API Tokens**, click **Create API Token**:
   - Permission: **Object Read & Write**
   - Apply to bucket: Select your bucket
4. Copy the:
   - **Account ID** -> `R2_ACCOUNT_ID`
   - **Access Key ID** -> `R2_ACCESS_KEY_ID`
   - **Secret Access Key** -> `R2_SECRET_ACCESS_KEY`
   - **Bucket Name** -> `R2_BUCKET_NAME`
5. (Optional) In the bucket settings under **Settings > Public access**, you can connect a custom domain or enable an `r2.dev` subdomain and set `R2_PUBLIC_URL`. If left empty, audio streams securely through `/api/stream`.

---

## Free-Tier Allowance & Cost Breakdown

| Service | Free Tier Allowance | Potential Charges if Exceeded |
| :--- | :--- | :--- |
| **Cloudflare R2** | **10 GB / month** free storage<br>10M Class B (read) operations/mo<br>1M Class A (write) operations/mo<br>**$0 egress fees** | $0.015 per GB/month for storage over 10GB. No bandwidth egress charges. |
| **Supabase** | **500 MB** PostgreSQL database<br>50,000 monthly active users | Upgrades start at $25/mo Pro plan if exceeding 500MB metadata. |
| **Vercel** | **100 GB** bandwidth / month<br>Serverless functions execution | $20/mo Pro plan if exceeding hobby limits. |

> **Cost Tip**: 10 GB of Cloudflare R2 storage holds approximately **2,000 to 2,500 high-quality MP3 songs** (at ~4-5 MB per song) for $0/month.

---

## Deployment to Vercel

1. Push your repository to GitHub / GitLab.
2. In [Vercel](https://vercel.com), click **Add New Project** and import your repository.
3. In the **Environment Variables** section, paste all variables from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `R2_ACCOUNT_ID`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET_NAME`
4. Click **Deploy**.
5. Open the deployed URL in Safari on your iPhone 12 mini. Tap the Share button and choose **Add to Home Screen** for a standalone app experience!

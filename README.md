# Minimal Music Player

A minimal, lightweight music player built with **Next.js (App Router)**, **TypeScript**, and **Tailwind CSS**. Designed specifically for single-handed use on **iPhone 12 mini** through Safari, with continuous **lock-screen background playback**.

---

## Features

- **iPhone Background Playback**: Music continues playing when your iPhone screen is locked. Includes lock-screen metadata (artwork, title, artist) and controls (play, pause, next, prev, seek) via the standard Media Session API.
- **Single Persistent Audio Element**: Avoids creating new `<audio>` elements across songs, preserving the active iOS Safari audio session in the background.
- **HTTP Range Requests (206 Partial Content)**: Audio streaming route supports byte ranges, enabling seeking and duration tracking on iOS Safari.
- **Local Device Storage (No Login Required)**:
  - Playlists, custom song order, and library metadata automatically persist in your browser (`localStorage`).
  - Opens instantly without any login or account creation friction.
  - *Note: Browser storage is stored locally on the current device/browser and is not automatically synced across separate devices.*
- **Add Music**:
  - **YouTube Links**: Saved as quick-access bookmarks with metadata (title, author, thumbnail). *No audio is extracted or downloaded.*
  - **Direct Audio URLs (MP3, M4A, AAC, WAV, FLAC)**: Added directly to your streaming library.
  - **Cloudflare R2 Uploads**: Upload owned audio files (up to 50 MB) directly to cloud storage.
- **Playlists**:
  - Create, rename, and delete playlists.
  - Add or remove tracks.
  - Reorder songs using drag-and-drop or one-touch **Move Up / Down** buttons optimized for iPhone 12 mini thumb reach.
  - Automatically saves all order changes.
- **Minimal & Premium UI**:
  - Dark mode by default (high contrast, OLED-friendly).
  - Responsive layout (desktop sidebar + mobile bottom navigation).
  - Expandable full-screen player with large scrubber and queue.

---

## iPhone Safari Background Playback & Technical Notes

### How Screen-Lock Background Playback Works
1. **Persistent `<audio>` Element**: iOS Safari suspends or denies audio playback if a new `<audio>` DOM node is instantiated while the device is locked or the tab is backgrounded. Minimal Player uses a single, persistent `<audio>` element mounted once in the app root.
2. **Auto-Advance on Lock Screen**: When a track finishes, the `ended` event listener on the persistent audio element synchronously switches `audio.src` to the next track and calls `audio.play()`. Because this occurs inside the active playback event loop, iOS Safari permits continuous playback without interruption.
3. **Media Session API**: Lock-screen playback controls (`play`, `pause`, `previoustrack`, `nexttrack`, `seekto`, `seekbackward`, `seekforward`) and metadata are registered via `navigator.mediaSession`.
4. **HTTP Range Requests (`206 Partial Content`)**: iOS Safari requires servers to respond with `206 Partial Content` and `Accept-Ranges: bytes` when streaming audio. If a server responds with `200 OK`, Safari cannot reliably scrub or display the total duration, often terminating playback. The `/api/stream?key=...` endpoint handles byte-range requests for Cloudflare R2.

### iOS Safari Limitations & Honest Quirks
- **Initial User Gesture**: Safari prohibits autoplay without an initial user touch. You must tap play at least once after opening the website.
- **Volume Controls**: Apple disables programmatic volume control (`audio.volume = x`) on iOS Safari. Volume must be adjusted via the physical iPhone volume buttons.
- **Safari Memory Eviction**: If you leave the locked phone playing for many hours or open dozens of heavy tabs, iOS Safari may evict the tab from memory if system RAM runs low. Minimal Player is kept lightweight with zero bloated client libraries to prevent this.

---

## Storage & Upload Security (No Login Required)

### Local Storage
- All playlist names, track lists, order, and bookmarks are automatically saved to browser `localStorage`.
- Storage is private to the current device/browser.

### Protecting Cloudflare R2 Uploads (`UPLOAD_SECRET`)
To prevent strangers on the internet from uploading files to your Cloudflare R2 bucket without requiring a complicated user login system, you can set an `UPLOAD_SECRET` in `.env.local` / Vercel:
```env
UPLOAD_SECRET=my-private-upload-passcode
```
When configured:
1. The server rejects any upload without this passcode (`401 Unauthorized`).
2. When uploading in the app, you enter your passcode once. The app remembers it in your phone's browser so you never have to retype it.

---

## Getting Started

### 1. Install Dependencies & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your desktop or iPhone Safari (via local network IP).

### 2. Environment Variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

### Cloudflare R2 Variables (When ready for R2):
```env
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=your-r2-bucket-name
R2_PUBLIC_URL=          # Optional: leave empty to stream through /api/stream
UPLOAD_SECRET=          # Optional: secret passcode to protect R2 uploads
```

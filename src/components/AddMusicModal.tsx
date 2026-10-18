"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  X,
  Link2,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Music2,
  Plus,
  ListMusic,
  RefreshCw,
  Bookmark,
  Square,
  Check,
  Film,
} from "lucide-react";
import { YoutubeIcon } from "@/components/icons/YoutubeIcon";
import {
  isYouTubeUrl,
  isAudioUrl,
  parseYouTubeUrl,
  validateLinkInput,
  fetchYouTubeMetadata,
  findExistingSongForYouTubeId,
  isSongInPlaylist,
} from "@/lib/link-utils";
import { useLibrary } from "@/lib/library-context";
import type {
  YouTubePlaylistInspection,
  ImportTrackProgress,
} from "@/lib/types";

interface AddMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddMusicModal({ isOpen, onClose }: AddMusicModalProps) {
  const {
    songs,
    playlists,
    playlistSongsMap,
    addSong,
    createPlaylist,
    addSongToPlaylist,
  } = useLibrary();

  // Mode: "upload" (File) vs "link" (Link / YouTube)
  const [mode, setMode] = useState<"upload" | "link">("upload");

  // Playlist selection & inline creation
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  // Link mode state
  const [urlInput, setUrlInput] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [linkArtist, setLinkArtist] = useState("");
  const [linkArtwork, setLinkArtwork] = useState("");
  const [isDetecting, setIsDetecting] = useState(false);

  // Link detection type: direct audio, single video, full playlist, or composite URL
  const [detectedKind, setDetectedKind] = useState<
    "direct" | "youtube_video" | "youtube_playlist" | "youtube_composite" | null
  >(null);

  // Composite choice: when URL has both video ID & playlist ID
  const [compositeChoice, setCompositeChoice] = useState<"video" | "playlist">("video");

  // YouTube Playlist Inspection & Preview state
  const [playlistInfo, setPlaylistInfo] = useState<YouTubePlaylistInspection | null>(null);
  const [isInspectingPlaylist, setIsInspectingPlaylist] = useState(false);

  // Sequential playlist import state
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false);
  const [isImportFinished, setIsImportFinished] = useState(false);
  const [importQueue, setImportQueue] = useState<ImportTrackProgress[]>([]);
  const [importActiveIndex, setImportActiveIndex] = useState<number>(-1);
  const isImportCancelledRef = useRef<boolean>(false);

  // Upload mode state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadArtist, setUploadArtist] = useState("");

  // Submission & status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Purge legacy passcode from storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("minimal_upload_secret");
      } catch {
        // Ignore storage access errors
      }
    }
  }, []);

  const handleReset = useCallback(() => {
    setUrlInput("");
    setLinkTitle("");
    setLinkArtist("");
    setLinkArtwork("");
    setDetectedKind(null);
    setCompositeChoice("video");
    setPlaylistInfo(null);
    setIsInspectingPlaylist(false);
    setIsImportingPlaylist(false);
    setIsImportFinished(false);
    setImportQueue([]);
    setImportActiveIndex(-1);
    isImportCancelledRef.current = false;
    setSelectedFile(null);
    setUploadTitle("");
    setUploadArtist("");
    setSelectedPlaylistId(null);
    setIsCreatingPlaylist(false);
    setNewPlaylistName("");
    setErrorMessage(null);
    setSuccessMessage(null);
    setUploadProgress(null);
    setStatusText("");
  }, []);

  const handleClose = () => {
    if (!isSubmitting && !isImportingPlaylist) {
      handleReset();
      onClose();
    }
  };

  if (!isOpen) return null;

  // Handle inline quick playlist creation
  const handleQuickCreatePlaylist = async () => {
    const name = newPlaylistName.trim();
    if (!name) {
      setIsCreatingPlaylist(false);
      return;
    }
    try {
      const pl = await createPlaylist(name);
      setSelectedPlaylistId(pl.id);
      setNewPlaylistName("");
      setIsCreatingPlaylist(false);
    } catch (err) {
      console.warn("Could not create playlist:", err);
    }
  };

  // Fetch playlist entries from backend
  const inspectPlaylist = async (url: string) => {
    setIsInspectingPlaylist(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/youtube?action=playlist&url=${encodeURIComponent(url)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to inspect YouTube playlist.");
      }
      setPlaylistInfo(data);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to load playlist information."
      );
      setPlaylistInfo(null);
    } finally {
      setIsInspectingPlaylist(false);
    }
  };

  // Inspect single video
  const inspectSingleVideo = async (url: string) => {
    setIsDetecting(true);
    setErrorMessage(null);
    try {
      const meta = await fetchYouTubeMetadata(url);
      setLinkTitle(meta.title);
      setLinkArtist(meta.artist);
      if (meta.thumbnailUrl) setLinkArtwork(meta.thumbnailUrl);
    } catch {
      setLinkTitle("YouTube Video");
      setLinkArtist("YouTube");
    } finally {
      setIsDetecting(false);
    }
  };

  // Auto-detect link format
  const handleLinkChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrlInput(val);
    setErrorMessage(null);
    setSuccessMessage(null);
    setPlaylistInfo(null);

    const trimmed = val.trim();
    if (!trimmed) {
      setDetectedKind(null);
      return;
    }

    if (isYouTubeUrl(trimmed)) {
      const parsed = parseYouTubeUrl(trimmed);
      if (parsed.isComposite) {
        setDetectedKind("youtube_composite");
        if (compositeChoice === "playlist") {
          inspectPlaylist(trimmed);
        } else {
          inspectSingleVideo(trimmed);
        }
      } else if (parsed.isPlaylistOnly) {
        setDetectedKind("youtube_playlist");
        inspectPlaylist(trimmed);
      } else {
        setDetectedKind("youtube_video");
        inspectSingleVideo(trimmed);
      }
    } else if (isAudioUrl(trimmed)) {
      setDetectedKind("direct");
      try {
        const u = new URL(trimmed);
        const filename = u.pathname.split("/").pop() || "Audio Stream";
        setLinkTitle(decodeURIComponent(filename.replace(/\.[^/.]+$/, "")));
        setLinkArtist("Online Stream");
      } catch {
        setLinkTitle("Direct Stream");
        setLinkArtist("Unknown Artist");
      }
    } else {
      setDetectedKind(null);
    }
  };

  // Switch choice for composite URL
  const handleCompositeChoiceChange = (choice: "video" | "playlist") => {
    setCompositeChoice(choice);
    setErrorMessage(null);
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (choice === "playlist") {
      inspectPlaylist(trimmed);
    } else {
      inspectSingleVideo(trimmed);
    }
  };

  // Submit Single Link (Audio stream, single YouTube video extraction, or bookmark)
  const handleSingleLinkSubmit = async (
    e: React.FormEvent,
    forceBookmark: boolean = false
  ) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmed = urlInput.trim();
    if (!trimmed) {
      setErrorMessage("Enter a valid URL");
      return;
    }

    // Require playlist selection for YouTube single video
    const isYt = detectedKind?.startsWith("youtube");
    if (isYt && !selectedPlaylistId) {
      setErrorMessage("Please select a destination website playlist.");
      return;
    }

    setIsSubmitting(true);

    try {
      const validation = await validateLinkInput(trimmed);
      if (!validation.isValid) {
        setErrorMessage(validation.error || "Unsupported audio URL");
        setIsSubmitting(false);
        return;
      }

      if (validation.type.startsWith("youtube")) {
        if (forceBookmark) {
          // Bookmark only
          await addSong(
            {
              title: linkTitle.trim() || "YouTube Bookmark",
              artist: linkArtist.trim() || "YouTube",
              album: "YouTube Bookmark",
              audio_url: "",
              youtube_url: trimmed,
              youtube_video_id: validation.videoId || undefined,
              artwork_url: linkArtwork || undefined,
              source_type: "youtube_bookmark",
            },
            selectedPlaylistId || undefined
          );
          setSuccessMessage("Bookmark saved");
        } else {
          // Check if song already exists in library
          const existingSong = validation.videoId
            ? findExistingSongForYouTubeId(songs, validation.videoId)
            : undefined;

          if (
            existingSong &&
            existingSong.source_type === "youtube_extracted" &&
            existingSong.audio_url
          ) {
            // Already extracted, reuse without duplicate download
            if (selectedPlaylistId) {
              await addSongToPlaylist(selectedPlaylistId, existingSong.id);
            }
            setSuccessMessage("Added existing track to playlist");
          } else {
            // Extract Audio & Upload to Supabase Storage
            setStatusText("Extracting audio...");

            const res = await fetch("/api/youtube", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                url: trimmed,
                title: linkTitle.trim(),
                artist: linkArtist.trim(),
              }),
            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
              throw new Error(data.error || `Extraction failed (${res.status})`);
            }

            await addSong(data.song, selectedPlaylistId || undefined);

            if (typeof window !== "undefined") {
              window.dispatchEvent(new Event("storage_updated"));
            }

            setSuccessMessage("Track added");
          }
        }
      } else {
        // Direct streamable URL
        await addSong(
          {
            title: linkTitle.trim() || "Audio Stream",
            artist: linkArtist.trim() || "Unknown Artist",
            audio_url: trimmed,
            artwork_url: linkArtwork || undefined,
            source_type: "direct_url",
          },
          selectedPlaylistId || undefined
        );
        setSuccessMessage("Stream added");
      }

      setTimeout(() => {
        handleReset();
        onClose();
      }, 900);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to add track");
    } finally {
      setIsSubmitting(false);
      setStatusText("");
    }
  };

  // Orchestrate Sequential YouTube Playlist Import
  const handleStartPlaylistImport = async () => {
    if (!playlistInfo || playlistInfo.entries.length === 0) {
      setErrorMessage("No tracks found in playlist to import.");
      return;
    }

    if (!selectedPlaylistId) {
      setErrorMessage("Please select an existing website playlist to import into.");
      return;
    }

    const targetPl = playlists.find((p) => p.id === selectedPlaylistId);
    if (!targetPl) {
      setErrorMessage("Selected website playlist could not be found.");
      return;
    }

    // Initialize sequential progress queue
    const queue: ImportTrackProgress[] = playlistInfo.entries.map((entry) => ({
      id: entry.id,
      title: entry.title,
      artist: entry.artist,
      thumbnail: entry.thumbnail,
      url: entry.url,
      status: entry.isUnavailable ? "skipped" : "waiting",
      error: entry.isUnavailable ? "Track unavailable on YouTube" : undefined,
    }));

    setImportQueue(queue);
    setIsImportingPlaylist(true);
    setIsImportFinished(false);
    isImportCancelledRef.current = false;
    setErrorMessage(null);
    setSuccessMessage(null);

    // Process each video individually (concurrency: 1)
    for (let i = 0; i < queue.length; i++) {
      if (isImportCancelledRef.current) {
        break;
      }

      const item = queue[i];
      if (!item || item.status === "skipped" || item.status === "added") {
        continue;
      }

      setImportActiveIndex(i);
      setImportQueue((prev) =>
        prev.map((q, idx) => (idx === i ? { ...q, status: "processing" } : q))
      );

      try {
        // 1. Check if video already in destination website playlist
        const currentPlSongIds = playlistSongsMap[selectedPlaylistId] || [];
        const alreadyInPl = isSongInPlaylist(currentPlSongIds, songs, item.id);

        if (alreadyInPl) {
          setImportQueue((prev) =>
            prev.map((q, idx) =>
              idx === i ? { ...q, status: "already_in_playlist" } : q
            )
          );
          continue;
        }

        // 2. Check if already extracted in library songs
        const existingSong = findExistingSongForYouTubeId(songs, item.id);
        if (
          existingSong &&
          existingSong.source_type === "youtube_extracted" &&
          existingSong.audio_url
        ) {
          // Reuse without re-downloading
          await addSongToPlaylist(selectedPlaylistId, existingSong.id);
          setImportQueue((prev) =>
            prev.map((q, idx) =>
              idx === i
                ? { ...q, status: "added", songId: existingSong.id }
                : q
            )
          );
          continue;
        }

        // 3. Extract and upload via per-video endpoint
        const res = await fetch("/api/youtube", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: item.url,
            title: item.title,
            artist: item.artist,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || `Extraction failed (${res.status})`);
        }

        // 4. Save song & associate with selected website playlist
        const savedSong = await addSong(data.song, selectedPlaylistId);
        setImportQueue((prev) =>
          prev.map((q, idx) =>
            idx === i ? { ...q, status: "added", songId: savedSong.id } : q
          )
        );
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : "Extraction failed";
        setImportQueue((prev) =>
          prev.map((q, idx) =>
            idx === i ? { ...q, status: "failed", error: errorMsg } : q
          )
        );
      }
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("storage_updated"));
    }

    setIsImportingPlaylist(false);
    setIsImportFinished(true);
    setImportActiveIndex(-1);
  };

  // Retry failed tracks only
  const handleRetryFailedTracks = async () => {
    if (!selectedPlaylistId) return;

    setIsImportingPlaylist(true);
    setIsImportFinished(false);
    isImportCancelledRef.current = false;

    for (let i = 0; i < importQueue.length; i++) {
      if (isImportCancelledRef.current) break;
      const item = importQueue[i];
      if (!item || item.status !== "failed") continue;

      setImportActiveIndex(i);
      setImportQueue((prev) =>
        prev.map((q, idx) => (idx === i ? { ...q, status: "processing", error: undefined } : q))
      );

      try {
        const res = await fetch("/api/youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: item.url,
            title: item.title,
            artist: item.artist,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Extraction failed (${res.status})`);
        }

        const saved = await addSong(data.song, selectedPlaylistId);
        setImportQueue((prev) =>
          prev.map((q, idx) => (idx === i ? { ...q, status: "added", songId: saved.id } : q))
        );
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Retry failed";
        setImportQueue((prev) =>
          prev.map((q, idx) => (idx === i ? { ...q, status: "failed", error: errorMsg } : q))
        );
      }
    }

    setIsImportingPlaylist(false);
    setIsImportFinished(true);
    setImportActiveIndex(-1);
  };

  // Convert failed tracks to YouTube bookmarks
  const handleBookmarkFailedTracks = async () => {
    if (!selectedPlaylistId) return;
    const failedItems = importQueue.filter((q) => q.status === "failed");
    for (const item of failedItems) {
      try {
        await addSong(
          {
            title: item.title,
            artist: item.artist,
            album: "YouTube Bookmark",
            audio_url: "",
            youtube_url: item.url,
            youtube_video_id: item.id,
            artwork_url: item.thumbnail,
            source_type: "youtube_bookmark",
          },
          selectedPlaylistId
        );
        setImportQueue((prev) =>
          prev.map((q) => (q.id === item.id ? { ...q, status: "bookmarked" } : q))
        );
      } catch (err) {
        console.warn("Failed to bookmark track:", err);
      }
    }
  };

  // Cancel running import
  const handleCancelImport = () => {
    isImportCancelledRef.current = true;
    setIsImportingPlaylist(false);
    setIsImportFinished(true);
  };

  // File selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setSuccessMessage(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setUploadTitle(file.name.replace(/\.[^/.]+$/, ""));
      setUploadArtist("");
    }
  };

  // File Upload submission
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage("Select audio file");
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setErrorMessage("File exceeds 50 MB");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setUploadProgress(0);
    setStatusText("Preparing...");

    try {
      const initRes = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type || "audio/mpeg",
          size: selectedFile.size,
          title: uploadTitle.trim(),
          artist: uploadArtist.trim(),
        }),
      });

      const initData = await initRes.json();

      if (!initRes.ok) {
        if (initRes.status === 429) {
          throw new Error("Rate limited. Wait 15m");
        }
        throw new Error(initData.error || "Upload failed");
      }

      setStatusText("Uploading...");

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", initData.signedUrl, true);

        const formData = new FormData();
        formData.append("cacheControl", "0");
        formData.append("", selectedFile);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percent);
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage error (${xhr.status})`));
          }
        };

        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(formData);
      });

      setStatusText("Finalizing...");

      const completeRes = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "complete",
          path: initData.path,
        }),
      });

      const completeData = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(completeData.error || "Finalize failed");
      }

      await addSong(completeData.song, selectedPlaylistId || undefined);

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("storage_updated"));
      }

      setSuccessMessage("Uploaded");

      setTimeout(() => {
        handleReset();
        onClose();
      }, 900);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
      setStatusText("");
      setUploadProgress(null);
    }
  };

  // Compute import stats
  const importCompletedCount = importQueue.filter(
    (q) => q.status === "added" || q.status === "bookmarked"
  ).length;
  const importSkippedCount = importQueue.filter(
    (q) => q.status === "already_in_playlist" || q.status === "skipped"
  ).length;
  const importFailedCount = importQueue.filter((q) => q.status === "failed").length;
  const importTotalCount = importQueue.length;
  const importProgressPercent =
    importTotalCount > 0
      ? Math.round(
          ((importCompletedCount + importSkippedCount + importFailedCount) /
            importTotalCount) *
            100
        )
      : 0;

  const selectedDestinationPlaylist = playlists.find(
    (p) => p.id === selectedPlaylistId
  );
  const isYouTubeMode = detectedKind?.startsWith("youtube");
  const isPlaylistActive =
    detectedKind === "youtube_playlist" ||
    (detectedKind === "youtube_composite" && compositeChoice === "playlist");

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      {/* Click outside backdrop */}
      <div className="absolute inset-0 -z-10" onClick={handleClose} />

      {/* Modal / Bottom Sheet Card */}
      <div className="w-full md:max-w-md max-h-[92vh] flex flex-col rounded-t-3xl md:rounded-2xl bg-[#09090c] border-t md:border border-white/[0.08] shadow-2xl p-4 sm:p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] overflow-y-auto no-scrollbar">
        {/* Mobile Pull Indicator */}
        <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mb-3 md:hidden shrink-0" />

        {/* Header: Segmented Control + Close */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <button
              type="button"
              disabled={isImportingPlaylist}
              onClick={() => {
                setMode("upload");
                setErrorMessage(null);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all disabled:opacity-40 ${
                mode === "upload"
                  ? "bg-white text-black shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              File
            </button>
            <button
              type="button"
              disabled={isImportingPlaylist}
              onClick={() => {
                setMode("link");
                setErrorMessage(null);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all disabled:opacity-40 ${
                mode === "link"
                  ? "bg-white text-black shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              Link
            </button>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting || isImportingPlaylist}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs space-y-2">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="font-medium leading-relaxed break-words">{errorMessage}</span>
            </div>
            {isYouTubeMode && !isPlaylistActive && !isSubmitting && (
              <button
                type="button"
                onClick={(e) => handleSingleLinkSubmit(e, true)}
                className="w-full py-1.5 px-3 rounded-lg bg-white/10 hover:bg-white/15 active:scale-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <YoutubeIcon className="w-3.5 h-3.5 text-red-400" />
                <span>Save as YouTube Bookmark instead</span>
              </button>
            )}
          </div>
        )}

        {successMessage && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium truncate">{successMessage}</span>
          </div>
        )}

        {/* ================= FILE UPLOAD TAB ================= */}
        {mode === "upload" ? (
          <form onSubmit={handleUploadSubmit} className="space-y-3.5">
            {!selectedFile ? (
              <label className="flex flex-col items-center justify-center h-28 rounded-2xl border border-dashed border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.04] cursor-pointer transition-all group active:scale-[0.99]">
                <div className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors mb-2">
                  <Upload className="w-4 h-4 stroke-[2]" />
                </div>
                <span className="text-xs font-medium text-zinc-300">Choose Audio</span>
                <span className="text-[10px] text-zinc-500 font-mono mt-0.5">MP3, M4A, WAV (Max 50MB)</span>
                <input
                  type="file"
                  accept="audio/mp3,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg,audio/flac"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/[0.06] flex items-center justify-center text-white shrink-0">
                    <Music2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{selectedFile.name}</p>
                    <p className="text-[10px] font-mono text-zinc-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="text-[11px] text-zinc-400 hover:text-white font-medium px-2 py-1 cursor-pointer"
                >
                  Change
                </button>
              </div>
            )}

            {selectedFile && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Title"
                  required
                  className="w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
                />
                <input
                  type="text"
                  value={uploadArtist}
                  onChange={(e) => setUploadArtist(e.target.value)}
                  placeholder="Artist"
                  className="w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
                />
              </div>
            )}

            {/* Destination Playlist Selector for File Upload */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 px-0.5">
                <span>Destination Playlist</span>
                {selectedPlaylistId && (
                  <button
                    type="button"
                    onClick={() => setSelectedPlaylistId(null)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedPlaylistId(null)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                    selectedPlaylistId === null
                      ? "bg-white text-black"
                      : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 border border-white/[0.06]"
                  }`}
                >
                  Library
                </button>

                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-all truncate max-w-[130px] ${
                      selectedPlaylistId === pl.id
                        ? "bg-white text-black"
                        : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 border border-white/[0.06]"
                    }`}
                  >
                    {pl.name}
                  </button>
                ))}

                {isCreatingPlaylist ? (
                  <div className="shrink-0 flex items-center gap-1 bg-white/[0.08] border border-white/[0.15] rounded-full pl-2.5 pr-1 py-0.5">
                    <input
                      type="text"
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      placeholder="Name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleQuickCreatePlaylist();
                        } else if (e.key === "Escape") {
                          setIsCreatingPlaylist(false);
                          setNewPlaylistName("");
                        }
                      }}
                      className="w-20 bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleQuickCreatePlaylist}
                      className="w-4 h-4 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-bold active:scale-90 cursor-pointer"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingPlaylist(false);
                        setNewPlaylistName("");
                      }}
                      className="w-4 h-4 rounded-full text-zinc-400 hover:text-white flex items-center justify-center text-[10px] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreatingPlaylist(true)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] text-zinc-400 border border-dashed border-white/[0.15] active:scale-95 transition-all cursor-pointer"
                  >
                    <Plus className="w-3 h-3 stroke-[2.5]" />
                    <span>New</span>
                  </button>
                )}
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={isSubmitting || !selectedFile}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-white text-black text-xs sm:text-sm font-semibold tracking-tight hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-40 cursor-pointer shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>
                      {uploadProgress !== null && uploadProgress > 0
                        ? `${uploadProgress}%`
                        : statusText || "Processing..."}
                    </span>
                  </>
                ) : (
                  "Upload & Stream"
                )}
              </button>
            </div>
          </form>
        ) : isImportingPlaylist || isImportFinished ? (
          /* ================= LIVE PLAYLIST IMPORT PROGRESS VIEW ================= */
          <div className="space-y-3.5">
            {/* Header: Source and Destination */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between text-xs font-medium text-zinc-400">
                <span className="truncate max-w-[200px]">
                  {playlistInfo?.title || "YouTube Playlist"}
                </span>
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md bg-white/[0.06] text-zinc-300">
                  {selectedDestinationPlaylist?.name || "Website Playlist"}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-300"
                  style={{ width: `${importProgressPercent}%` }}
                />
              </div>

              {/* Counters */}
              <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
                <span>
                  {importCompletedCount + importSkippedCount + importFailedCount} / {importTotalCount} processed
                </span>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-emerald-400 font-medium">✓ {importCompletedCount}</span>
                  {importSkippedCount > 0 && (
                    <span className="text-zinc-400 font-medium">⏭ {importSkippedCount}</span>
                  )}
                  {importFailedCount > 0 && (
                    <span className="text-rose-400 font-medium">✕ {importFailedCount}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Scrollable Track Queue */}
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
              {importQueue.map((item, idx) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-2 rounded-xl text-xs transition-colors border ${
                    idx === importActiveIndex
                      ? "bg-white/[0.08] border-white/20 text-white"
                      : item.status === "failed"
                      ? "bg-rose-500/5 border-rose-500/20 text-zinc-300"
                      : item.status === "added"
                      ? "bg-emerald-500/5 border-emerald-500/20 text-zinc-300"
                      : "bg-white/[0.02] border-white/[0.04] text-zinc-400"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    {item.thumbnail ? (
                      <img
                        src={item.thumbnail}
                        alt=""
                        className="w-8 h-8 rounded-lg object-cover shrink-0 border border-white/10"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center shrink-0">
                        <Music2 className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[11px] text-zinc-200">
                        {item.title}
                      </p>
                      <p className="text-[10px] text-zinc-500 truncate">{item.artist}</p>
                    </div>
                  </div>

                  {/* Status badge */}
                  <div className="shrink-0 text-[10px] font-semibold">
                    {item.status === "processing" && (
                      <div className="flex items-center gap-1 text-white">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>Extracting</span>
                      </div>
                    )}
                    {item.status === "added" && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        <span>Added</span>
                      </span>
                    )}
                    {item.status === "already_in_playlist" && (
                      <span className="text-zinc-500">In playlist</span>
                    )}
                    {item.status === "skipped" && (
                      <span className="text-zinc-500">Unavailable</span>
                    )}
                    {item.status === "bookmarked" && (
                      <span className="text-blue-400 flex items-center gap-1">
                        <Bookmark className="w-3 h-3" />
                        <span>Bookmarked</span>
                      </span>
                    )}
                    {item.status === "failed" && (
                      <span className="text-rose-400 font-medium">Failed</span>
                    )}
                    {item.status === "waiting" && (
                      <span className="text-zinc-600">Waiting</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Actions for Import */}
            <div className="pt-1 space-y-2">
              {isImportingPlaylist ? (
                <button
                  type="button"
                  onClick={handleCancelImport}
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold active:scale-98 transition-all cursor-pointer"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Import</span>
                </button>
              ) : (
                <div className="space-y-2">
                  {importFailedCount > 0 && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleRetryFailedTracks}
                        className="h-10 flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-semibold active:scale-98 transition-all cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Failed ({importFailedCount})</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleBookmarkFailedTracks}
                        className="h-10 flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] text-white text-xs font-semibold active:scale-98 transition-all cursor-pointer"
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>Save as Bookmarks</span>
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-white text-black text-xs font-semibold active:scale-98 transition-all cursor-pointer shadow-xs"
                  >
                    <span>Done</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ================= LINK / YOUTUBE TAB ================= */
          <div className="space-y-3.5">
            {/* URL Input */}
            <div className="relative">
              <Link2 className="w-3.5 h-3.5 absolute left-3.5 top-3 text-zinc-500" />
              <input
                type="url"
                value={urlInput}
                onChange={handleLinkChange}
                placeholder="Paste YouTube link or audio stream URL"
                required
                className="w-full pl-9 pr-9 py-2.5 rounded-xl text-xs sm:text-sm bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
              />
              {(isDetecting || isInspectingPlaylist) && (
                <div className="absolute right-3.5 top-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                </div>
              )}
            </div>

            {/* Composite Link Selector: Choose between single video vs full playlist */}
            {detectedKind === "youtube_composite" && (
              <div className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2">
                <div className="text-[11px] font-medium text-zinc-400 px-1">
                  This link contains both a video and a playlist:
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => handleCompositeChoiceChange("video")}
                    className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      compositeChoice === "video"
                        ? "bg-white text-black shadow-xs"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>Single Video</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCompositeChoiceChange("playlist")}
                    className={`py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      compositeChoice === "playlist"
                        ? "bg-white text-black shadow-xs"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    <ListMusic className="w-3.5 h-3.5" />
                    <span>Full Playlist</span>
                  </button>
                </div>
              </div>
            )}

            {/* YouTube Playlist Preview Card */}
            {isPlaylistActive && playlistInfo && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] space-y-2.5">
                <div className="flex items-center gap-3">
                  {playlistInfo.thumbnail ? (
                    <img
                      src={playlistInfo.thumbnail}
                      alt=""
                      className="w-12 h-12 object-cover rounded-xl border border-white/10 shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-red-950/40 border border-red-500/20 flex items-center justify-center shrink-0">
                      <ListMusic className="w-6 h-6 text-red-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400">
                      <YoutubeIcon className="w-3 h-3" />
                      <span>YouTube Playlist</span>
                    </div>
                    <p className="text-xs font-medium text-white truncate mt-0.5">
                      {playlistInfo.title}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">
                      {playlistInfo.channel} • {playlistInfo.itemCount} tracks
                    </p>
                  </div>
                </div>

                {/* Compact preview list of first few entries */}
                <div className="max-h-28 overflow-y-auto space-y-1 pr-1 border-t border-white/[0.06] pt-2 no-scrollbar">
                  {playlistInfo.entries.slice(0, 8).map((entry, idx) => (
                    <div
                      key={entry.id || idx}
                      className="flex items-center justify-between text-[11px] text-zinc-400 py-0.5"
                    >
                      <span className="truncate pr-2">
                        {idx + 1}. {entry.title}
                      </span>
                      {entry.duration ? (
                        <span className="shrink-0 text-[10px] text-zinc-500 font-mono">
                          {Math.floor(entry.duration / 60)}:
                          {String(entry.duration % 60).padStart(2, "0")}
                        </span>
                      ) : null}
                    </div>
                  ))}
                  {playlistInfo.entries.length > 8 && (
                    <div className="text-[10px] text-zinc-500 italic pt-0.5">
                      + {playlistInfo.entries.length - 8} more tracks
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* YouTube Single Video Preview Card */}
            {detectedKind && !isPlaylistActive && detectedKind.startsWith("youtube") && (
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                {linkArtwork ? (
                  <img
                    src={linkArtwork}
                    alt="YouTube thumbnail"
                    className="w-14 h-10 object-cover rounded-lg border border-white/[0.08] shrink-0"
                  />
                ) : (
                  <div className="w-14 h-10 rounded-lg bg-red-950/40 border border-red-500/20 flex items-center justify-center shrink-0">
                    <YoutubeIcon className="w-5 h-5 text-red-500" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400">
                    <YoutubeIcon className="w-3 h-3" />
                    <span>YouTube Video</span>
                  </div>
                  <p className="text-xs font-medium text-white truncate mt-0.5">
                    {linkTitle || "YouTube Video"}
                  </p>
                  <p className="text-[11px] text-zinc-500 truncate">
                    {linkArtist || "YouTube Channel"}
                  </p>
                </div>
              </div>
            )}

            {/* Direct Audio Stream Badge */}
            {detectedKind === "direct" && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300">
                <Music2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate">{linkTitle || "Audio Stream"}</span>
              </div>
            )}

            {/* Metadata Fields for single track */}
            {!isPlaylistActive && (detectedKind || urlInput.trim()) && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="Title"
                  required
                  className="w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
                />
                <input
                  type="text"
                  value={linkArtist}
                  onChange={(e) => setLinkArtist(e.target.value)}
                  placeholder="Artist"
                  className="w-full px-3.5 py-2 rounded-xl text-xs sm:text-sm bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
                />
              </div>
            )}

            {/* Destination Website Playlist Selector */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 px-0.5">
                <div className="flex items-center gap-1">
                  <span>Destination Website Playlist</span>
                  {isYouTubeMode && (
                    <span className="text-[10px] text-rose-400 font-semibold">*Required</span>
                  )}
                </div>
                {selectedPlaylistId && (
                  <button
                    type="button"
                    onClick={() => setSelectedPlaylistId(null)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {/* For non-YouTube (direct audio stream), allow "Library" */}
                {!isYouTubeMode && (
                  <button
                    type="button"
                    onClick={() => setSelectedPlaylistId(null)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer ${
                      selectedPlaylistId === null
                        ? "bg-white text-black"
                        : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 border border-white/[0.06]"
                    }`}
                  >
                    Library
                  </button>
                )}

                {/* Existing Website Playlists */}
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => setSelectedPlaylistId(pl.id)}
                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-all truncate max-w-[130px] cursor-pointer ${
                      selectedPlaylistId === pl.id
                        ? "bg-white text-black"
                        : "bg-white/[0.04] hover:bg-white/[0.08] text-zinc-400 border border-white/[0.06]"
                    }`}
                  >
                    {pl.name}
                  </button>
                ))}

                {/* Inline New Website Playlist Creation */}
                {isCreatingPlaylist ? (
                  <div className="shrink-0 flex items-center gap-1 bg-white/[0.08] border border-white/[0.15] rounded-full pl-2.5 pr-1 py-0.5">
                    <input
                      type="text"
                      value={newPlaylistName}
                      onChange={(e) => setNewPlaylistName(e.target.value)}
                      placeholder="Playlist name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleQuickCreatePlaylist();
                        } else if (e.key === "Escape") {
                          setIsCreatingPlaylist(false);
                          setNewPlaylistName("");
                        }
                      }}
                      className="w-24 bg-transparent text-xs text-white placeholder:text-zinc-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleQuickCreatePlaylist}
                      className="w-4 h-4 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-bold active:scale-90 cursor-pointer"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingPlaylist(false);
                        setNewPlaylistName("");
                      }}
                      className="w-4 h-4 rounded-full text-zinc-400 hover:text-white flex items-center justify-center text-[10px] cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreatingPlaylist(true)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] text-zinc-400 border border-dashed border-white/[0.15] active:scale-95 transition-all cursor-pointer"
                  >
                    <Plus className="w-3 h-3 stroke-[2.5]" />
                    <span>New playlist</span>
                  </button>
                )}
              </div>

              {/* Requirement notice for YouTube */}
              {isYouTubeMode && !selectedPlaylistId && (
                <p className="text-[10px] text-zinc-500 italic pt-0.5 px-0.5">
                  Select an existing website playlist or tap &quot;+ New playlist&quot; above to import.
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-1 space-y-2">
              {isPlaylistActive ? (
                /* Import Playlist Button */
                <button
                  type="button"
                  disabled={
                    isInspectingPlaylist ||
                    !playlistInfo ||
                    !selectedPlaylistId ||
                    playlistInfo.itemCount === 0
                  }
                  onClick={handleStartPlaylistImport}
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-white text-black text-xs sm:text-sm font-semibold tracking-tight hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-40 cursor-pointer shadow-xs"
                >
                  {isInspectingPlaylist ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Inspecting playlist...</span>
                    </>
                  ) : !selectedPlaylistId ? (
                    "Select destination playlist"
                  ) : (
                    <>
                      <ListMusic className="w-4 h-4" />
                      <span>
                        Import {playlistInfo ? `${playlistInfo.itemCount} tracks ` : ""}into{" "}
                        {selectedDestinationPlaylist?.name || "playlist"}
                      </span>
                    </>
                  )}
                </button>
              ) : (
                /* Single Video / Stream Button */
                <>
                  <button
                    type="button"
                    onClick={(e) => handleSingleLinkSubmit(e, false)}
                    disabled={
                      isSubmitting ||
                      !urlInput.trim() ||
                      (isYouTubeMode && !selectedPlaylistId)
                    }
                    className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-white text-black text-xs sm:text-sm font-semibold tracking-tight hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-40 cursor-pointer shadow-xs"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{statusText || "Processing..."}</span>
                      </>
                    ) : isYouTubeMode && !selectedPlaylistId ? (
                      "Select destination playlist"
                    ) : isYouTubeMode ? (
                      <>
                        <Music2 className="w-4 h-4" />
                        <span>Extract Audio into {selectedDestinationPlaylist?.name}</span>
                      </>
                    ) : (
                      "Add Stream"
                    )}
                  </button>

                  {isYouTubeMode && !isSubmitting && (
                    <button
                      type="button"
                      disabled={!selectedPlaylistId}
                      onClick={(e) => handleSingleLinkSubmit(e, true)}
                      className="w-full py-1 text-center text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40 cursor-pointer"
                    >
                      Bookmark Only
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

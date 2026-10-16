"use client";

import React, { useState, useCallback } from "react";
import {
  X,
  Link2,
  Upload,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Music2,
  Key,
  Plus,
} from "lucide-react";
import { YoutubeIcon } from "@/components/icons/YoutubeIcon";
import {
  isYouTubeUrl,
  isAudioUrl,
  validateLinkInput,
  fetchYouTubeMetadata,
} from "@/lib/link-utils";
import { useLibrary } from "@/lib/library-context";

interface AddMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddMusicModal({ isOpen, onClose }: AddMusicModalProps) {
  const { addSong, playlists, createPlaylist } = useLibrary();

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
  const [detectedType, setDetectedType] = useState<"youtube" | "direct" | null>(null);

  // Upload mode state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadArtist, setUploadArtist] = useState("");

  // Passcode state
  const [savedSecret, setSavedSecret] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("minimal_upload_secret") || "";
    }
    return "";
  });
  const [uploadSecret, setUploadSecret] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("minimal_upload_secret") || "";
    }
    return "";
  });
  const [isEditingPasscode, setIsEditingPasscode] = useState(() => {
    if (typeof window !== "undefined") {
      return !localStorage.getItem("minimal_upload_secret");
    }
    return true;
  });

  // Submission & status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleReset = useCallback(() => {
    setUrlInput("");
    setLinkTitle("");
    setLinkArtist("");
    setLinkArtwork("");
    setDetectedType(null);
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
    if (!isSubmitting) {
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

  // Auto-detect link format
  const handleLinkChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrlInput(val);
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmed = val.trim();
    if (!trimmed) {
      setDetectedType(null);
      return;
    }

    if (isYouTubeUrl(trimmed)) {
      setDetectedType("youtube");
      setIsDetecting(true);
      try {
        const meta = await fetchYouTubeMetadata(trimmed);
        setLinkTitle(meta.title);
        setLinkArtist(meta.artist);
        if (meta.thumbnailUrl) setLinkArtwork(meta.thumbnailUrl);
      } catch {
        setLinkTitle("YouTube Video");
        setLinkArtist("YouTube");
      } finally {
        setIsDetecting(false);
      }
    } else if (isAudioUrl(trimmed)) {
      setDetectedType("direct");
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
      setDetectedType(null);
    }
  };

  // Submit Link (Audio stream, YouTube extraction, or YouTube bookmark)
  const handleLinkSubmit = async (
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

    setIsSubmitting(true);

    try {
      const validation = await validateLinkInput(trimmed);
      if (!validation.isValid) {
        setErrorMessage(validation.error || "Unsupported audio URL");
        setIsSubmitting(false);
        return;
      }

      if (validation.type === "youtube") {
        if (forceBookmark) {
          // Bookmark only
          await addSong(
            {
              title: linkTitle.trim() || "YouTube Bookmark",
              artist: linkArtist.trim() || "YouTube",
              album: "YouTube Bookmark",
              audio_url: "",
              youtube_url: trimmed,
              artwork_url: linkArtwork || undefined,
              source_type: "youtube_bookmark",
            },
            selectedPlaylistId || undefined
          );
          setSuccessMessage("Bookmark saved");
        } else {
          // Extract Audio & Upload to Supabase Storage
          const effectiveSecret = (uploadSecret.trim() || savedSecret.trim()).trim();
          if (!effectiveSecret) {
            setIsEditingPasscode(true);
            setErrorMessage("Passcode required");
            setIsSubmitting(false);
            return;
          }

          setStatusText("Extracting audio...");

          const res = await fetch("/api/youtube", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-upload-secret": effectiveSecret,
            },
            body: JSON.stringify({
              url: trimmed,
              title: linkTitle.trim(),
              artist: linkArtist.trim(),
              secret: effectiveSecret,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            if (res.status === 401) {
              if (typeof window !== "undefined") {
                localStorage.removeItem("minimal_upload_secret");
              }
              setSavedSecret("");
              setIsEditingPasscode(true);
              throw new Error("Incorrect passcode");
            }
            if (res.status === 429) {
              throw new Error("Rate limited. Wait 15m");
            }
            throw new Error(data.error || "Extraction failed");
          }

          if (typeof window !== "undefined" && uploadSecret.trim()) {
            localStorage.setItem("minimal_upload_secret", uploadSecret.trim());
            setSavedSecret(uploadSecret.trim());
            setIsEditingPasscode(false);
          }

          await addSong(data.song, selectedPlaylistId || undefined);

          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event("storage_updated"));
          }

          setSuccessMessage("Track added");
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

  // Select File
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

  // Submit File Upload
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage("Select audio file");
      return;
    }

    const effectiveSecret = (uploadSecret.trim() || savedSecret.trim()).trim();
    if (!effectiveSecret) {
      setIsEditingPasscode(true);
      setErrorMessage("Passcode required");
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
          "x-upload-secret": effectiveSecret,
        },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type || "audio/mpeg",
          size: selectedFile.size,
          title: uploadTitle.trim(),
          artist: uploadArtist.trim(),
          secret: effectiveSecret,
        }),
      });

      const initData = await initRes.json();

      if (!initRes.ok) {
        if (initRes.status === 401) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("minimal_upload_secret");
          }
          setSavedSecret("");
          setIsEditingPasscode(true);
          throw new Error("Incorrect passcode");
        }
        if (initRes.status === 429) {
          throw new Error("Rate limited. Wait 15m");
        }
        throw new Error(initData.error || "Upload failed");
      }

      setStatusText("Uploading...");

      // Upload directly to Supabase Storage signed URL
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", initData.signedUrl, true);

        const formData = new FormData();
        formData.append("cacheControl", "3600");
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

      // Complete upload
      const completeRes = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-upload-secret": effectiveSecret,
        },
        body: JSON.stringify({
          action: "complete",
          path: initData.path,
          secret: effectiveSecret,
        }),
      });

      const completeData = await completeRes.json();
      if (!completeRes.ok) {
        throw new Error(completeData.error || "Finalize failed");
      }

      // Add to library & playlist
      await addSong(completeData.song, selectedPlaylistId || undefined);

      if (typeof window !== "undefined" && uploadSecret.trim()) {
        localStorage.setItem("minimal_upload_secret", uploadSecret.trim());
        setSavedSecret(uploadSecret.trim());
        setIsEditingPasscode(false);
      }

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

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end md:items-center justify-center p-0 md:p-4 animate-fade-in">
      {/* Click outside backdrop */}
      <div
        className="absolute inset-0 -z-10"
        onClick={handleClose}
      />

      {/* Modal / Bottom Sheet Card */}
      <div className="w-full md:max-w-md max-h-[90vh] flex flex-col rounded-t-3xl md:rounded-2xl bg-[#09090c] border-t md:border border-white/[0.08] shadow-2xl p-4 sm:p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] overflow-y-auto no-scrollbar">
        {/* Mobile Pull Indicator */}
        <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mb-3 md:hidden shrink-0" />

        {/* Header: Segmented Control + Close */}
        <div className="flex items-center justify-between mb-4 shrink-0">
          <div className="flex p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <button
              type="button"
              onClick={() => {
                setMode("upload");
                setErrorMessage(null);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all ${
                mode === "upload"
                  ? "bg-white text-black shadow-xs"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              File
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("link");
                setErrorMessage(null);
              }}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold tracking-tight transition-all ${
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
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors disabled:opacity-30"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="mb-3 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="font-medium truncate">{errorMessage}</span>
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
            {/* File Drop / Tap Zone */}
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
                  className="text-[11px] text-zinc-400 hover:text-white font-medium px-2 py-1"
                >
                  Change
                </button>
              </div>
            )}

            {/* Title & Artist Inputs */}
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

            {/* Playlist Selector Section */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 px-0.5">
                <span>Playlist</span>
                {selectedPlaylistId && (
                  <button
                    type="button"
                    onClick={() => setSelectedPlaylistId(null)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {/* Default: Library Only */}
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

                {/* Existing Playlists */}
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

                {/* Inline New Playlist Pill */}
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
                      className="w-4 h-4 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-bold active:scale-90"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingPlaylist(false);
                        setNewPlaylistName("");
                      }}
                      className="w-4 h-4 rounded-full text-zinc-400 hover:text-white flex items-center justify-center text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreatingPlaylist(true)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] text-zinc-400 border border-dashed border-white/[0.15] active:scale-95 transition-all"
                  >
                    <Plus className="w-3 h-3 stroke-[2.5]" />
                    <span>New</span>
                  </button>
                )}
              </div>
            </div>

            {/* Passcode UI */}
            {selectedFile && (!savedSecret || isEditingPasscode) && (
              <div className="relative pt-0.5">
                <Key className="w-3.5 h-3.5 absolute left-3.5 top-3 text-zinc-500" />
                <input
                  type="password"
                  value={uploadSecret}
                  onChange={(e) => setUploadSecret(e.target.value)}
                  placeholder="Passcode"
                  required
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
                />
              </div>
            )}

            {selectedFile && savedSecret && !isEditingPasscode && (
              <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1 pt-0.5">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Key className="w-3 h-3 text-emerald-400" />
                  <span>Passcode saved</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingPasscode(true)}
                  className="hover:text-zinc-300 transition-colors"
                >
                  Change
                </button>
              </div>
            )}

            {/* Submit Button */}
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
        ) : (
          /* ================= LINK / YOUTUBE TAB ================= */
          <form onSubmit={handleLinkSubmit} className="space-y-3.5">
            {/* URL Input */}
            <div className="relative">
              <Link2 className="w-3.5 h-3.5 absolute left-3.5 top-3 text-zinc-500" />
              <input
                type="url"
                value={urlInput}
                onChange={handleLinkChange}
                placeholder="Paste audio URL or YouTube link"
                required
                className="w-full pl-9 pr-9 py-2.5 rounded-xl text-xs sm:text-sm bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
              />
              {isDetecting && (
                <div className="absolute right-3.5 top-3">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-400" />
                </div>
              )}
            </div>

            {/* YouTube Preview Card */}
            {detectedType === "youtube" && (
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
                    <span>YouTube</span>
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
            {detectedType === "direct" && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300">
                <Music2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate">{linkTitle || "Audio Stream"}</span>
              </div>
            )}

            {/* Metadata Fields */}
            {(detectedType || urlInput.trim()) && (
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

            {/* Playlist Selector Section */}
            <div className="space-y-1.5 pt-0.5">
              <div className="flex items-center justify-between text-[11px] font-medium text-zinc-400 px-0.5">
                <span>Playlist</span>
                {selectedPlaylistId && (
                  <button
                    type="button"
                    onClick={() => setSelectedPlaylistId(null)}
                    className="text-[10px] text-zinc-500 hover:text-zinc-300"
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
                      className="w-4 h-4 rounded-full bg-white text-black flex items-center justify-center text-[10px] font-bold active:scale-90"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCreatingPlaylist(false);
                        setNewPlaylistName("");
                      }}
                      className="w-4 h-4 rounded-full text-zinc-400 hover:text-white flex items-center justify-center text-[10px]"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsCreatingPlaylist(true)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white/[0.03] hover:bg-white/[0.07] text-zinc-400 border border-dashed border-white/[0.15] active:scale-95 transition-all"
                  >
                    <Plus className="w-3 h-3 stroke-[2.5]" />
                    <span>New</span>
                  </button>
                )}
              </div>
            </div>

            {/* Passcode for YouTube extraction */}
            {detectedType === "youtube" && (!savedSecret || isEditingPasscode) && (
              <div className="relative pt-0.5">
                <Key className="w-3.5 h-3.5 absolute left-3.5 top-3 text-zinc-500" />
                <input
                  type="password"
                  value={uploadSecret}
                  onChange={(e) => setUploadSecret(e.target.value)}
                  placeholder="Passcode"
                  className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30 transition-colors"
                />
              </div>
            )}

            {detectedType === "youtube" && savedSecret && !isEditingPasscode && (
              <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1 pt-0.5">
                <span className="flex items-center gap-1.5 text-zinc-400">
                  <Key className="w-3 h-3 text-emerald-400" />
                  <span>Passcode saved</span>
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingPasscode(true)}
                  className="hover:text-zinc-300 transition-colors"
                >
                  Change
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-1 space-y-2">
              <button
                type="submit"
                disabled={isSubmitting || !urlInput.trim()}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-white text-black text-xs sm:text-sm font-semibold tracking-tight hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-40 cursor-pointer shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{statusText || "Processing..."}</span>
                  </>
                ) : detectedType === "youtube" ? (
                  <>
                    <Music2 className="w-4 h-4" />
                    <span>Extract Audio</span>
                  </>
                ) : (
                  "Add Track"
                )}
              </button>

              {detectedType === "youtube" && !isSubmitting && (
                <button
                  type="button"
                  onClick={(e) => handleLinkSubmit(e, true)}
                  className="w-full py-1 text-center text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  Bookmark Only
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

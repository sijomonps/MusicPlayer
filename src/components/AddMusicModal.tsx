"use client";

import React, { useState } from "react";
import { X, Link2, Upload, AlertCircle, CheckCircle2, Loader2, Music2 } from "lucide-react";
import { YoutubeIcon } from "@/components/icons/YoutubeIcon";
import { isYouTubeUrl, isAudioUrl, fetchYouTubeMetadata } from "@/lib/link-utils";
import { useLibrary } from "@/lib/library-context";

interface AddMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddMusicModal({ isOpen, onClose }: AddMusicModalProps) {
  const { addSong } = useLibrary();

  const [mode, setMode] = useState<"link" | "upload">("link");

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

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setUrlInput("");
    setLinkTitle("");
    setLinkArtist("");
    setLinkArtwork("");
    setDetectedType(null);
    setSelectedFile(null);
    setUploadTitle("");
    setUploadArtist("");
    setErrorMessage(null);
    setSuccessMessage(null);
  };

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
    } else if (isAudioUrl(trimmed) || trimmed.startsWith("http")) {
      setDetectedType("direct");
      // Derive title from filename
      try {
        const u = new URL(trimmed);
        const filename = u.pathname.split("/").pop() || "Stream Audio";
        setLinkTitle(decodeURIComponent(filename.replace(/\.[^/.]+$/, "")));
        setLinkArtist("Online Stream");
      } catch {
        setLinkTitle("Direct Audio Stream");
        setLinkArtist("Unknown Artist");
      }
    } else {
      setDetectedType(null);
    }
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const trimmed = urlInput.trim();

    if (!trimmed) {
      setErrorMessage("Please enter a valid URL.");
      return;
    }

    try {
      new URL(trimmed);
    } catch {
      setErrorMessage("The provided URL is invalid. Please enter a complete URL starting with http:// or https://");
      return;
    }

    setIsSubmitting(true);

    try {
      if (isYouTubeUrl(trimmed)) {
        // Save as bookmark only
        await addSong({
          title: linkTitle || "YouTube Bookmark",
          artist: linkArtist || "YouTube",
          album: "YouTube Bookmark",
          audio_url: "",
          youtube_url: trimmed,
          artwork_url: linkArtwork || undefined,
          source_type: "youtube_bookmark",
        });
        setSuccessMessage("YouTube bookmark saved successfully.");
      } else {
        // Direct streamable URL
        await addSong({
          title: linkTitle || "Audio Stream",
          artist: linkArtist || "Unknown Artist",
          audio_url: trimmed,
          artwork_url: linkArtwork || undefined,
          source_type: "direct_url",
        });
        setSuccessMessage("Streamable audio added to your library.");
      }

      setTimeout(() => {
        handleReset();
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to add song.");
    } finally {
      setIsSubmitting(false);
    }
  };

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

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMessage("Please select an audio file to upload.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("title", uploadTitle.trim());
      formData.append("artist", uploadArtist.trim());

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        // If Cloudflare R2 is not configured on server, provide clear advice
        if (res.status === 503) {
          throw new Error(
            "Cloudflare R2 is not configured yet. Set R2 credentials in .env.local to enable cloud uploads."
          );
        }
        throw new Error(data.error || "Upload failed");
      }

      // Add to library
      await addSong({
        title: data.song.title,
        artist: data.song.artist,
        audio_url: data.song.audio_url,
        r2_key: data.song.r2_key,
        source_type: "upload",
      });

      setSuccessMessage("Audio file uploaded to Cloudflare R2 successfully.");
      setTimeout(() => {
        handleReset();
        onClose();
      }, 1200);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Add Music
          </h2>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 px-5 pt-2">
          <button
            onClick={() => {
              setMode("link");
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              mode === "link"
                ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <Link2 className="w-4 h-4" />
            Paste Link
          </button>
          <button
            onClick={() => {
              setMode("upload");
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              mode === "upload"
                ? "border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            <Upload className="w-4 h-4" />
            Upload Audio (R2)
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="flex items-center gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {mode === "link" ? (
            <form onSubmit={handleLinkSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Link (YouTube or Direct MP3/M4A)
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={handleLinkChange}
                    placeholder="https://... (.mp3, .m4a or youtube.com)"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                  />
                  {isDetecting && (
                    <div className="absolute right-3 top-3">
                      <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    </div>
                  )}
                </div>
              </div>

              {/* Detected Badge / Notice */}
              {detectedType === "youtube" && (
                <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
                    <YoutubeIcon className="w-4 h-4" />
                    <span>YouTube Bookmark</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    This video will be saved as a quick bookmark with its metadata. In accordance with policy, audio is not extracted or streamed.
                  </p>
                </div>
              )}

              {detectedType === "direct" && (
                <div className="p-3 rounded-lg bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <Music2 className="w-4 h-4" />
                    <span>Direct Audio Stream</span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Streamable audio file. Can be played directly and controlled in background on iPhone.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Title
                </label>
                <input
                  type="text"
                  value={linkTitle}
                  onChange={(e) => setLinkTitle(e.target.value)}
                  placeholder="Song or Video Title"
                  required
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Artist / Channel
                </label>
                <input
                  type="text"
                  value={linkArtist}
                  onChange={(e) => setLinkArtist(e.target.value)}
                  placeholder="Artist name"
                  className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !urlInput.trim()}
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : detectedType === "youtube" ? (
                    "Save YouTube Bookmark"
                  ) : (
                    "Add to Library"
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                  Select Audio File (MP3, M4A, AAC, WAV, FLAC - Max 50MB)
                </label>
                <input
                  type="file"
                  accept="audio/mp3,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/ogg,audio/flac"
                  onChange={handleFileChange}
                  className="block w-full text-xs text-zinc-500 file:mr-3 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-900 dark:file:text-zinc-100 hover:file:opacity-80 cursor-pointer"
                />
              </div>

              {selectedFile && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                      Song Title
                    </label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      placeholder="Title"
                      required
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                      Artist (Optional)
                    </label>
                    <input
                      type="text"
                      value={uploadArtist}
                      onChange={(e) => setUploadArtist(e.target.value)}
                      placeholder="Artist"
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                    />
                  </div>

                  <div className="text-xs text-zinc-500">
                    File: <span className="font-mono">{selectedFile.name}</span> (
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </div>
                </>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedFile}
                  className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-zinc-900 text-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 text-sm font-medium hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading to Cloudflare R2...
                    </>
                  ) : (
                    "Upload and Stream"
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

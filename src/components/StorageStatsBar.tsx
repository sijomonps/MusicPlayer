"use client";

import React, { useState, useEffect, useCallback } from "react";

interface StorageInfo {
  usedFormatted: string;
  quotaFormatted: string;
  remainingFormatted: string;
  percentUsed: number;
}

interface StorageStatsBarProps {
  className?: string;
  variant?: "bar" | "pill";
}

export function StorageStatsBar({
  className = "",
  variant = "bar",
}: StorageStatsBarProps) {
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  const fetchStats = useCallback(() => {
    fetch("/api/upload")
      .then((res) => res.json())
      .then((data) => {
        if (data?.configured && data?.storage) {
          setStorage({
            usedFormatted: data.storage.usedFormatted,
            quotaFormatted: data.storage.quotaFormatted,
            remainingFormatted: data.storage.remainingFormatted,
            percentUsed: data.storage.percentUsed,
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStats();
    const handleUpdate = () => fetchStats();
    window.addEventListener("storage_updated", handleUpdate);
    return () => window.removeEventListener("storage_updated", handleUpdate);
  }, [fetchStats]);

  if (!storage) {
    return (
      <div className={`text-[10px] font-mono text-zinc-500 ${className}`}>
        -- / 1 GB
      </div>
    );
  }

  // Pill variant for MobileHeader
  if (variant === "pill") {
    const isWarning = storage.percentUsed >= 85;
    const isCritical = storage.percentUsed >= 95;

    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-[10px] font-mono ${className}`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isCritical
              ? "bg-rose-500 animate-pulse"
              : isWarning
              ? "bg-amber-400"
              : "bg-emerald-400"
          }`}
        />
        <span className="text-zinc-300 font-medium">
          {storage.usedFormatted}
        </span>
        <span className="text-zinc-600">/</span>
        <span className="text-zinc-500">1 GB</span>
      </div>
    );
  }

  // Bar variant for Sidebar / Modal
  const isWarning = storage.percentUsed >= 85;
  const isCritical = storage.percentUsed >= 95;
  const barColor = isCritical
    ? "bg-rose-500"
    : isWarning
    ? "bg-amber-400"
    : "bg-white";

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="text-zinc-400">
          <strong className="text-zinc-200 font-medium">{storage.usedFormatted}</strong>
          <span className="text-zinc-600 mx-1">/</span>
          <span className="text-zinc-500">1 GB</span>
        </span>
        <span className="text-zinc-400 tabular-nums">
          {storage.percentUsed}%
        </span>
      </div>

      <div className="h-1 w-full bg-white/[0.08] rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300 rounded-full`}
          style={{ width: `${Math.min(100, Math.max(storage.percentUsed > 0 ? 1 : 0, storage.percentUsed))}%` }}
        />
      </div>
    </div>
  );
}

"use client";

import { Music, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ArchivePlaylistEntry } from "@/lib/types/playlist";

interface PlaylistItemProps {
  entry: ArchivePlaylistEntry;
  isActive: boolean;
  onClick: () => void;
  onInfoClick?: () => void;
}

export function PlaylistItem({ entry, isActive, onClick, onInfoClick }: PlaylistItemProps) {
  if (entry.entryType !== "playcut") {
    return null;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2 text-left transition-colors rounded-md cursor-pointer",
        "hover:bg-gray-100 dark:hover:bg-gray-800",
        isActive &&
          "bg-purple-50 dark:bg-purple-900/20 border-l-2 border-purple-600 dark:border-purple-400"
      )}
    >
      {/* Album art thumbnail */}
      <div className="flex-shrink-0 w-12 h-12 rounded bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden">
        {entry.artworkLoading ? (
          <Skeleton className="w-full h-full" />
        ) : entry.artworkUrl ? (
          <img
            src={entry.artworkUrl}
            alt={`${entry.releaseTitle} artwork`}
            className="w-full h-full object-cover"
          />
        ) : (
          <Music className="w-5 h-5 text-gray-400 dark:text-gray-500" />
        )}
      </div>

      {/* Song + Artist */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm font-medium truncate",
            isActive
              ? "text-purple-900 dark:text-purple-100"
              : "text-gray-900 dark:text-gray-100"
          )}
        >
          {entry.songTitle || "Unknown Track"}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {entry.artistName || "Unknown Artist"}
        </p>
      </div>

      {/* Info button */}
      {onInfoClick && (
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 h-8 w-8"
          onClick={(e) => {
            e.stopPropagation();
            onInfoClick();
          }}
        >
          <Info className="h-4 w-4 text-gray-400" />
        </Button>
      )}
    </div>
  );
}

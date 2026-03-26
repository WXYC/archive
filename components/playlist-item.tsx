"use client";

import { Music, Info, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ArchivePlaylistEntry } from "@/lib/types/playlist";

interface PlaylistItemProps {
  entry: ArchivePlaylistEntry;
  isActive: boolean;
  onClick: () => void;
}

export function PlaylistItem({ entry, isActive, onClick }: PlaylistItemProps) {
  if (entry.entryType !== "playcut") {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2 text-left transition-colors rounded-md",
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
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="flex-shrink-0 h-8 w-8"
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="h-4 w-4 text-gray-400" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72" side="left" align="start">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Track Info</h4>
            {entry.releaseTitle && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Album</span>
                <p className="text-sm">{entry.releaseTitle}</p>
              </div>
            )}
            {entry.labelName && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Label</span>
                <p className="text-sm">{entry.labelName}</p>
              </div>
            )}
            {entry.metadata?.genre && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Genre</span>
                <p className="text-sm">{entry.metadata.genre}</p>
              </div>
            )}
            {entry.metadata?.format && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Format</span>
                <p className="text-sm">{entry.metadata.format}</p>
              </div>
            )}
            {entry.metadata?.callNumber && (
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">Call Number</span>
                <p className="text-sm font-mono">{entry.metadata.callNumber}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-1 pt-1">
              {entry.rotation && (
                <span className="inline-block text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded">
                  Rotation
                </span>
              )}
              {entry.request && (
                <span className="inline-block text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                  Request
                </span>
              )}
            </div>
            {(entry.metadata?.discogsUrl || entry.metadata?.libraryUrl) && (
              <div className="flex gap-2 pt-1 border-t dark:border-gray-700">
                {entry.metadata?.discogsUrl && (
                  <a
                    href={entry.metadata.discogsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Discogs <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {entry.metadata?.libraryUrl && (
                  <a
                    href={entry.metadata.libraryUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Library <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </button>
  );
}

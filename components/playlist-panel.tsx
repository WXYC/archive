"use client";

import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaylistItem } from "@/components/playlist-item";
import type { ArchivePlaylistEntry } from "@/lib/types/playlist";

interface PlaylistPanelProps {
  entries: ArchivePlaylistEntry[];
  isLoading: boolean;
  error: string | null;
  activeEntryId: number | null;
  onEntryClick: (entry: ArchivePlaylistEntry) => void;
}

export function PlaylistPanel({
  entries,
  isLoading,
  error,
  activeEntryId,
  onEntryClick,
}: PlaylistPanelProps) {
  const activeRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to keep active entry visible
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeEntryId]);

  const playcuts = entries.filter((e) => e.entryType === "playcut");

  if (isLoading) {
    return (
      <div className="space-y-3 p-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2">
            <Skeleton className="w-12 h-12 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
      </div>
    );
  }

  if (playcuts.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No playlist data available for this hour
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {playcuts.map((entry) => (
          <div
            key={entry.id}
            ref={entry.id === activeEntryId ? activeRef : undefined}
          >
            <PlaylistItem
              entry={entry}
              isActive={entry.id === activeEntryId}
              onClick={() => onEntryClick(entry)}
            />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

"use client";

import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { PlaylistItem } from "@/components/playlist-item";
import { getHourLabel } from "@/lib/utils";
import type { DailyPlaylistEntry, ShowBlock } from "@/lib/types/playlist";

interface PlaylistPanelProps {
  shows: ShowBlock[];
  isLoading: boolean;
  error: string | null;
  activeEntryId: number | null;
  onEntryClick: (entry: DailyPlaylistEntry) => void;
}

function formatShowTime(epochMs: number): string {
  if (epochMs === 0) return "";
  const date = new Date(epochMs);
  return getHourLabel(date.getHours(), date.getMinutes());
}

export function PlaylistPanel({
  shows,
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

  const hasEntries = shows.some((show) =>
    show.entries.some((e) => e.entryType === "playcut")
  );

  if (!hasEntries) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] p-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No playlist data available for this day
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        {shows.map((show) => {
          const playcuts = show.entries.filter(
            (e) => e.entryType === "playcut"
          );
          if (playcuts.length === 0) return null;

          return (
            <div key={show.showId} className="mb-4 last:mb-0">
              {/* Show header */}
              <div className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-purple-700 dark:text-purple-400 truncate">
                    {show.showId === 0 ? "Automation" : show.djHandle}
                    {show.showName && (
                      <span className="font-normal text-gray-500 dark:text-gray-400">
                        {" "}
                        &mdash; {show.showName}
                      </span>
                    )}
                  </span>
                  {show.signonTime > 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {formatShowTime(show.signonTime)}
                      {show.signoffTime > 0 &&
                        ` \u2013 ${formatShowTime(show.signoffTime)}`}
                    </span>
                  )}
                </div>
              </div>

              {/* Entries */}
              <div className="space-y-1 mt-1">
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
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

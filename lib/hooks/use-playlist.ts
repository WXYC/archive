"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ArchivePlaylistEntry,
  PlaylistResponse,
} from "@/lib/types/playlist";

export interface UsePlaylistResult {
  entries: ArchivePlaylistEntry[];
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches and manages playlist data for the selected date and hour.
 * Re-fetches when date or hour changes while archive is selected.
 */
export function usePlaylist(
  selectedDate: Date | null,
  selectedHour: number | null,
  archiveSelected: boolean
): UsePlaylistResult {
  const [entries, setEntries] = useState<ArchivePlaylistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchPlaylist = useCallback(
    async (date: Date, hour: number) => {
      // Abort any in-flight request
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;

      try {
        const response = await fetch(
          `/api/playlist?date=${dateStr}&hour=${hour}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            data.error || `Failed to fetch playlist (${response.status})`
          );
        }

        const data: PlaylistResponse = await response.json();
        setEntries(data.entries);
        setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // Request was cancelled, don't update state
        }
        console.error("Error fetching playlist:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load playlist"
        );
        setEntries([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!archiveSelected || selectedDate === null || selectedHour === null) {
      setEntries([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    fetchPlaylist(selectedDate, selectedHour);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [selectedDate, selectedHour, archiveSelected, fetchPlaylist]);

  return { entries, isLoading, error };
}

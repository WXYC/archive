"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  ArchivePlaylistEntry,
  PlaylistResponse,
} from "@/lib/types/playlist";
import type { ArtworkResponse } from "@/app/api/artwork/route";

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

        // Kick off lazy artwork enrichment for playcut entries
        enrichWithArtwork(data.entries, controller.signal);
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

  // Artwork cache to avoid re-fetching across hour changes
  const artworkCacheRef = useRef<Map<string, ArtworkResponse>>(new Map());

  const enrichWithArtwork = useCallback(
    async (playlistEntries: ArchivePlaylistEntry[], signal: AbortSignal) => {
      const playcuts = playlistEntries.filter(
        (e) => e.entryType === "playcut" && e.artistName
      );
      if (playcuts.length === 0) return;

      // Mark all playcuts as loading
      setEntries((prev) =>
        prev.map((e) =>
          e.entryType === "playcut" ? { ...e, artworkLoading: true } : e
        )
      );

      // Semaphore for concurrency limiting (max 3 concurrent)
      let running = 0;
      const queue = [...playcuts];

      const processNext = async (): Promise<void> => {
        if (signal.aborted || queue.length === 0) return;
        const entry = queue.shift()!;
        running++;

        const cacheKey = `${entry.artistName}|${entry.releaseTitle}`;
        const cached = artworkCacheRef.current.get(cacheKey);

        let artworkData: ArtworkResponse;
        if (cached) {
          artworkData = cached;
        } else {
          try {
            const res = await fetch("/api/artwork", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                artist: entry.artistName,
                album: entry.releaseTitle,
              }),
              signal,
            });
            artworkData = await res.json();
            artworkCacheRef.current.set(cacheKey, artworkData);
          } catch {
            artworkData = {
              artworkUrl: null,
              genre: null,
              format: null,
              callNumber: null,
              libraryUrl: null,
              discogsUrl: null,
            };
          }
        }

        if (!signal.aborted) {
          setEntries((prev) =>
            prev.map((e) =>
              e.id === entry.id
                ? {
                    ...e,
                    artworkUrl: artworkData.artworkUrl,
                    artworkLoading: false,
                    metadata: {
                      genre: artworkData.genre,
                      format: artworkData.format,
                      callNumber: artworkData.callNumber,
                      libraryUrl: artworkData.libraryUrl,
                      discogsUrl: artworkData.discogsUrl,
                    },
                  }
                : e
            )
          );
        }

        running--;
        await processNext();
      };

      // Start up to 3 concurrent workers
      const workers = Array.from(
        { length: Math.min(3, playcuts.length) },
        () => processNext()
      );
      await Promise.all(workers);
    },
    []
  );

  return { entries, isLoading, error };
}

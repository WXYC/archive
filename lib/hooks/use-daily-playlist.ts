"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  DailyPlaylistEntry,
  DailyPlaylistResponse,
  ShowBlock,
} from "@/lib/types/playlist";
import type { ArtworkResponse } from "@/app/api/artwork/route";

export interface UseDailyPlaylistResult {
  shows: ShowBlock[];
  isLoading: boolean;
  error: string | null;
  dayStartEpoch: number;
}

/**
 * Fetches and manages daily playlist data for the selected date.
 * Re-fetches when date changes. Keyed on date only — changing the hour
 * does not trigger a refetch.
 */
export function useDailyPlaylist(
  selectedDate: Date | null,
  archiveSelected: boolean
): UseDailyPlaylistResult {
  const [shows, setShows] = useState<ShowBlock[]>([]);
  const [dayStartEpoch, setDayStartEpoch] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const artworkCacheRef = useRef<Map<string, ArtworkResponse>>(new Map());

  const enrichWithArtwork = useCallback(
    async (showBlocks: ShowBlock[], signal: AbortSignal) => {
      const allPlaycuts: DailyPlaylistEntry[] = [];
      for (const show of showBlocks) {
        for (const entry of show.entries) {
          if (entry.entryType === "playcut" && entry.artistName) {
            allPlaycuts.push(entry);
          }
        }
      }
      if (allPlaycuts.length === 0) return;

      // Mark all playcuts as loading
      setShows((prev) =>
        prev.map((show) => ({
          ...show,
          entries: show.entries.map((e) =>
            e.entryType === "playcut" ? { ...e, artworkLoading: true } : e
          ),
        }))
      );

      // Semaphore for concurrency limiting (max 3 concurrent)
      const queue = [...allPlaycuts];

      const processNext = async (): Promise<void> => {
        if (signal.aborted || queue.length === 0) return;
        const entry = queue.shift()!;

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
              releaseYear: null,
              artistBio: null,
              wikipediaUrl: null,
              spotifyUrl: null,
              appleMusicUrl: null,
              youtubeMusicUrl: null,
              bandcampUrl: null,
              soundcloudUrl: null,
            };
          }
        }

        if (!signal.aborted) {
          setShows((prev) =>
            prev.map((show) => ({
              ...show,
              entries: show.entries.map((e) =>
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
                        releaseYear: artworkData.releaseYear,
                        artistBio: artworkData.artistBio,
                        wikipediaUrl: artworkData.wikipediaUrl,
                        spotifyUrl: artworkData.spotifyUrl,
                        appleMusicUrl: artworkData.appleMusicUrl,
                        youtubeMusicUrl: artworkData.youtubeMusicUrl,
                        bandcampUrl: artworkData.bandcampUrl,
                        soundcloudUrl: artworkData.soundcloudUrl,
                      },
                    }
                  : e
              ),
            }))
          );
        }

        await processNext();
      };

      const workers = Array.from(
        { length: Math.min(3, allPlaycuts.length) },
        () => processNext()
      );
      await Promise.all(workers);
    },
    []
  );

  const fetchDailyPlaylist = useCallback(
    async (date: Date) => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setError(null);

      const dateStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;

      try {
        const response = await fetch(
          `/api/daily-playlist?date=${dateStr}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            data.error || `Failed to fetch daily playlist (${response.status})`
          );
        }

        const data: DailyPlaylistResponse = await response.json();
        setShows(data.shows);
        setDayStartEpoch(data.dayStartEpoch);
        setError(null);

        enrichWithArtwork(data.shows, controller.signal);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        console.error("Error fetching daily playlist:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load daily playlist"
        );
        setShows([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [enrichWithArtwork]
  );

  useEffect(() => {
    if (!archiveSelected || selectedDate === null) {
      setShows([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    fetchDailyPlaylist(selectedDate);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [selectedDate, archiveSelected, fetchDailyPlaylist]);

  return { shows, isLoading, error, dayStartEpoch };
}

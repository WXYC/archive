"use client";

import { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { formatDate, getArchiveUrl, getHourLabel } from "@/lib/utils";
import { CalendarIcon } from "lucide-react";
import AudioPlayer from "@/components/audio-player";
import { ThemeToggle } from "@/components/theme-toggle";
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog";
import { LoginDialog } from "@/components/login-dialog";
import { defaultConfig, getDateRange, archiveConfigs } from "@/config/archive";
import { useAuth } from "@/lib/auth";
import { useDailyPlaylist } from "@/lib/hooks/use-daily-playlist";
import { PlaylistPanel } from "@/components/playlist-panel";
import type { DailyPlaylistEntry } from "@/lib/types/playlist";

function ArchivePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, getToken } = useAuth();

  // Use dj config if authenticated, otherwise use default
  const selectedConfig = isAuthenticated ? archiveConfigs.dj : defaultConfig;
  const djConfig = archiveConfigs.dj;

  // Get date range from selected config
  const { today, startDate: allowedStart } = getDateRange(selectedConfig);
  const { startDate: djStart } = getDateRange(djConfig);

  // Default to the most recent completed hour
  const latestArchiveHour = new Date();
  latestArchiveHour.setHours(latestArchiveHour.getHours() - 1, 0, 0, 0);

  // Helper function to parse timestamp from URL
  const parseTimestamp = (
    timestamp: string | null
  ): { date: Date; hour: string; minute: string; second: string } | null => {
    if (!timestamp || timestamp.length !== 14) return null;

    try {
      const year = parseInt(timestamp.slice(0, 4));
      const month = parseInt(timestamp.slice(4, 6)) - 1;
      const day = parseInt(timestamp.slice(6, 8));
      const hour = parseInt(timestamp.slice(8, 10));
      const minute = parseInt(timestamp.slice(10, 12));
      const second = parseInt(timestamp.slice(12, 14));

      const date = new Date(year, month, day);
      if (isNaN(date.getTime())) return null;

      return {
        date,
        hour: hour.toString(),
        minute: minute.toString(),
        second: second.toString(),
      };
    } catch {
      return null;
    }
  };

  // Helper function to create timestamp for URL
  const createTimestamp = (
    date: Date,
    hour: number,
    minute: number = 0,
    second: number = 0
  ): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hourStr = hour.toString().padStart(2, "0");
    const minuteStr = minute.toString().padStart(2, "0");
    const secondStr = second.toString().padStart(2, "0");
    return `${year}${month}${day}${hourStr}${minuteStr}${secondStr}`;
  };

  // Initialize state from URL params if they exist
  const timestamp = searchParams.get("t");
  const initialState = timestamp ? parseTimestamp(timestamp) : null;

  // State
  const [selectedDate, setSelectedDate] = useState<Date>(
    initialState?.date || latestArchiveHour
  );
  const [selectedHour, setSelectedHour] = useState<string>(
    initialState?.hour || latestArchiveHour.getHours().toString()
  );
  const [selectedMinute, setSelectedMinute] = useState<string>(
    initialState?.minute || "0"
  );
  const [selectedSecond, setSelectedSecond] = useState<string>(
    initialState?.second || "0"
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [archiveSelected, setArchiveSelected] = useState(true);
  const [invalidLinkReason, setInvalidLinkReason] = useState<string | null>(
    null
  );
  const [userDismissed, setUserDismissed] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const [seekToSeconds, setSeekToSeconds] = useState<number | null>(null);
  const [seekRequestId, setSeekRequestId] = useState(0);
  const [pendingSeekSeconds, setPendingSeekSeconds] = useState<number | null>(null);

  // Daily playlist data (keyed on date only — hour changes don't refetch)
  const {
    shows,
    isLoading: playlistLoading,
    error: playlistError,
  } = useDailyPlaylist(selectedDate, archiveSelected);

  // Flat sorted list of all playcuts across all shows (for J/K navigation + active entry)
  const allPlaycutEntries = useMemo(
    () =>
      shows
        .flatMap((show) =>
          show.entries.filter((e) => e.entryType === "playcut")
        )
        .sort((a, b) => a.dayOffsetSeconds - b.dayOffsetSeconds),
    [shows]
  );

  // Derive active entry from playback time (day-level)
  const currentDayOffsetSeconds =
    parseInt(selectedHour) * 3600 + currentPlaybackTime;

  const activeEntryId =
    allPlaycutEntries.reduce<DailyPlaylistEntry | null>((best, entry) => {
      if (
        entry.dayOffsetSeconds <= currentDayOffsetSeconds &&
        (!best || entry.dayOffsetSeconds > best.dayOffsetSeconds)
      ) {
        return entry;
      }
      return best;
    }, null)?.id ?? null;

  // Seek to a playlist entry within the current hour
  const seekToEntry = useCallback(
    (entry: DailyPlaylistEntry) => {
      setSeekToSeconds(entry.offsetSeconds);
      setSeekRequestId((prev) => prev + 1);
      setCurrentPlaybackTime(entry.offsetSeconds);
      setSelectedMinute(Math.floor(entry.offsetSeconds / 60).toString());
      setSelectedSecond(Math.floor(entry.offsetSeconds % 60).toString());
      if (!isPlaying) {
        setIsPlaying(true);
      }
    },
    [isPlaying]
  );

  // Handle playlist entry click -> seek audio (cross-hour aware)
  const handlePlaylistEntryClick = useCallback(
    (entry: DailyPlaylistEntry) => {
      if (entry.hour !== parseInt(selectedHour)) {
        setSelectedHour(entry.hour.toString());
        setPendingSeekSeconds(entry.offsetSeconds);
        if (!isPlaying) setIsPlaying(true);
      } else {
        seekToEntry(entry);
      }
    },
    [selectedHour, isPlaying, seekToEntry]
  );

  // Apply pending seek after hour change triggers a new MP3 load
  useEffect(() => {
    if (pendingSeekSeconds !== null && audioUrl) {
      setSeekToSeconds(pendingSeekSeconds);
      setSeekRequestId((prev) => prev + 1);
      setCurrentPlaybackTime(pendingSeekSeconds);
      setSelectedMinute(Math.floor(pendingSeekSeconds / 60).toString());
      setSelectedSecond(Math.floor(pendingSeekSeconds % 60).toString());
      setPendingSeekSeconds(null);
    }
  }, [audioUrl, pendingSeekSeconds]);

  // Handle J/K keyboard shortcuts for track navigation (cross-hour)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key !== "j" && e.key !== "k") return;
      if (allPlaycutEntries.length === 0) return;

      e.preventDefault();

      const activeIndex = allPlaycutEntries.findIndex(
        (entry) => entry.id === activeEntryId
      );

      let targetIndex: number;
      if (e.key === "j") {
        targetIndex = activeIndex > 0 ? activeIndex - 1 : 0;
      } else {
        targetIndex =
          activeIndex < allPlaycutEntries.length - 1
            ? activeIndex + 1
            : allPlaycutEntries.length - 1;
      }

      const targetEntry = allPlaycutEntries[targetIndex];
      if (targetEntry.hour !== parseInt(selectedHour)) {
        setSelectedHour(targetEntry.hour.toString());
        setPendingSeekSeconds(targetEntry.offsetSeconds);
        if (!isPlaying) setIsPlaying(true);
      } else {
        seekToEntry(targetEntry);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allPlaycutEntries, activeEntryId, seekToEntry, selectedHour, isPlaying]);

  // Effect to check if the initial timestamp is out of range
  useEffect(() => {
    if (!timestamp || !initialState?.date || userDismissed) {
      setInvalidLinkReason(null);
      return;
    }
    const date = initialState.date;
    if (date > today || date < allowedStart) {
      if (!isAuthenticated && date >= djStart && date <= today) {
        setInvalidLinkReason("login");
      } else {
        setInvalidLinkReason("out_of_range");
      }
    } else {
      setInvalidLinkReason(null);
    }
  }, [
    timestamp,
    isAuthenticated,
    today,
    allowedStart,
    djStart,
    initialState,
    userDismissed,
  ]);

  // Reset userDismissed when URL or auth state changes
  useEffect(() => {
    setUserDismissed(false);
  }, [timestamp, isAuthenticated]);

  // Function to update URL with current selection
  const updateUrl = (date: Date, hour: string) => {
    if (date > today || date < allowedStart) {
      return;
    }
    const ts = createTimestamp(
      date,
      parseInt(hour),
      parseInt(selectedMinute),
      parseInt(selectedSecond)
    );
    router.push(`?t=${ts}`, { scroll: false });
  };

  // Update URL when date or hour changes
  useEffect(() => {
    updateUrl(selectedDate, selectedHour);
  }, [selectedDate, selectedHour]);

  // Update audio URL when date or hour changes
  useEffect(() => {
    async function updateAudioUrl() {
      if (selectedDate && selectedHour && archiveSelected) {
        try {
          const token = await getToken();
          const url = await getArchiveUrl(
            selectedDate,
            Number.parseInt(selectedHour),
            token
          );
          setAudioUrl(url);
        } catch (error) {
          console.error("Error getting audio URL:", error);
          setAudioUrl(null);
        }
      }
    }

    updateAudioUrl();
  }, [selectedDate, selectedHour, archiveSelected, getToken]);

  // Update handler for hour changes to include date
  const handleHourChange = (newHour: number, newDate: Date) => {
    if (newDate > today || newDate < allowedStart) {
      return;
    }

    setSelectedDate(newDate);
    setSelectedHour(newHour.toString());
    setSelectedMinute("0");
    setSelectedSecond("0");
  };

  return (
    <div className="container mx-auto px-4 py-3 sm:py-4 max-w-5xl h-screen flex flex-col overflow-hidden">
      {invalidLinkReason && (
        <div className="mb-4 p-3 rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 border border-yellow-300 dark:border-yellow-700 flex justify-between items-center">
          <span>
            {invalidLinkReason === "login"
              ? "This show is only available to signed-in users. Please sign in to access this date."
              : "This show is outside the available date range."}
          </span>
          <button
            onClick={() => {
              setInvalidLinkReason(null);
              setUserDismissed(true);
            }}
            className="ml-2 text-yellow-900 dark:text-yellow-100 hover:text-yellow-700 dark:hover:text-yellow-300"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex justify-between items-center mb-4">
        <LoginDialog />
        <div className="flex items-center gap-1">
          <KeyboardShortcutsDialog />
          <ThemeToggle />
        </div>
      </div>
      <Card className="border-none shadow-lg dark:bg-gray-800 py-0 flex-1 flex flex-col min-h-0">
        <CardHeader className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-t-lg py-4">
          <CardTitle className="text-2xl sm:text-3xl font-bold">
            WXYC Archive Player
          </CardTitle>
          <CardDescription className="text-purple-100">
            Listen to WXYC programming from the{" "}
            {selectedConfig.dateRange.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 flex-1 flex flex-col min-h-0">
          <div className="flex flex-col flex-1 min-h-0">
            {/* Date picker + hour picker row */}
            <div className="flex gap-2 mb-4">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1 justify-start text-left font-normal"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formatDate(selectedDate)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-auto p-0"
                    align="start"
                    sideOffset={8}
                  >
                    <style jsx global>{`
                      .dark button[data-selected-single="true"]:hover {
                        background-color: var(--primary) !important;
                        color: var(--primary-foreground) !important;
                      }
                    `}</style>
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(date);
                          setCalendarOpen(false);
                        }
                      }}
                      disabled={(date) => date > today || date < allowedStart}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

              <Select value={selectedHour} onValueChange={setSelectedHour}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Select hour" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={i.toString()}>
                      {getHourLabel(i)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Daily playlist grouped by show */}
            <div className="border dark:border-gray-700 rounded-md flex-1 overflow-hidden mb-4">
              <PlaylistPanel
                shows={shows}
                isLoading={playlistLoading}
                error={playlistError}
                activeEntryId={activeEntryId}
                onEntryClick={handlePlaylistEntryClick}
              />
            </div>
          </div>

          {/* Playback controls */}
          <AudioPlayer
            audioUrl={audioUrl}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            selectedDate={selectedDate}
            selectedHour={Number.parseInt(selectedHour)}
            selectedMinute={Number.parseInt(selectedMinute)}
            selectedSecond={Number.parseInt(selectedSecond)}
            archiveSelected={archiveSelected}
            onHourChange={handleHourChange}
            onTimeUpdate={(minute: number, second: number) => {
              setSelectedMinute(minute.toString());
              setSelectedSecond(second.toString());
              setCurrentPlaybackTime(minute * 60 + second);
            }}
            config={selectedConfig}
            seekToSeconds={seekToSeconds}
            seekRequestId={seekRequestId}
            getToken={getToken}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function ArchivePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ArchivePageContent />
    </Suspense>
  );
}

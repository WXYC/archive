"use client";

import { useState, useEffect, Suspense } from "react";
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
import { Button } from "@/components/ui/button";
import { formatDate, getArchiveUrl, getHourLabel } from "@/lib/utils";
import AudioPlayer from "@/components/audio-player";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginDialog } from "@/components/login-dialog";
import { defaultConfig, getDateRange, archiveConfigs } from "@/config/archive";
import { useAuth } from "@/lib/auth";

function ArchivePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated } = useAuth();

  // Use dj config if authenticated, otherwise use default
  const selectedConfig = isAuthenticated ? archiveConfigs.dj : defaultConfig;
  const djConfig = archiveConfigs.dj;

  // Get date range from selected config
  const { today, startDate: allowedStart } = getDateRange(selectedConfig);
  const { startDate: djStart } = getDateRange(djConfig);

  // Set default to yesterday at noon
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);

  // Helper function to parse timestamp from URL
  const parseTimestamp = (
    timestamp: string | null
  ): { date: Date; hour: string; minute: string; second: string } | null => {
    if (!timestamp || timestamp.length !== 14) return null;

    try {
      const year = parseInt(timestamp.slice(0, 4));
      const month = parseInt(timestamp.slice(4, 6)) - 1; // JS months are 0-based
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

  // Initialize state from URL params if they exist, otherwise use yesterday at noon
  const timestamp = searchParams.get("t");
  const initialState = timestamp ? parseTimestamp(timestamp) : null;

  // State
  const [selectedDate, setSelectedDate] = useState<Date>(
    initialState?.date || yesterday
  );
  const [selectedHour, setSelectedHour] = useState<string>(
    initialState?.hour || "12"
  );
  const [selectedMinute, setSelectedMinute] = useState<string>(
    initialState?.minute || "0"
  );
  const [selectedSecond, setSelectedSecond] = useState<string>(
    initialState?.second || "0"
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [archiveSelected, setArchiveSelected] = useState(!!timestamp);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);
  const [invalidLinkReason, setInvalidLinkReason] = useState<string | null>(
    null
  );
  const [userDismissed, setUserDismissed] = useState(false);

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
    // Only update URL if the date is within the allowed range
    if (date > today || date < allowedStart) {
      return;
    }
    const timestamp = createTimestamp(
      date,
      parseInt(hour),
      parseInt(selectedMinute),
      parseInt(selectedSecond)
    );
    router.push(`?t=${timestamp}`, { scroll: false });
  };

  // Update URL when date or hour changes
  useEffect(() => {
    updateUrl(selectedDate, selectedHour);
  }, [selectedDate, selectedHour]);

  // Update audio URL when date or hour changes
  useEffect(() => {
    async function updateAudioUrl() {
      if (selectedDate && selectedHour && archiveSelected) {
        setIsLoadingUrl(true);
        try {
          const url = await getArchiveUrl(
            selectedDate,
            Number.parseInt(selectedHour),
            isAuthenticated
          );
          setAudioUrl(url);
          // If we have a timestamp in the URL, start playing automatically
          if (timestamp) {
            setIsPlaying(true);
          }
        } catch (error) {
          console.error("Error getting audio URL:", error);
          setAudioUrl(null);
        } finally {
          setIsLoadingUrl(false);
        }
      }
    }

    updateAudioUrl();
  }, [selectedDate, selectedHour, archiveSelected, isAuthenticated, timestamp]);

  const handlePlay = () => {
    setArchiveSelected(true);
    setIsPlaying(true);
  };

  // Update handler for hour changes to include date
  const handleHourChange = (newHour: number, newDate: Date) => {
    // Check if the new date is within the allowed range
    if (newDate > today || newDate < allowedStart) {
      return; // Don't update if outside the allowed range
    }

    setSelectedDate(newDate);
    setSelectedHour(newHour.toString());
  };

  return (
    <div className="container mx-auto px-4 py-8 pb-32 max-w-4xl min-h-screen">
      {invalidLinkReason && (
        <div className="mb-4 p-3 rounded bg-yellow-100 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-100 border border-yellow-300 dark:border-yellow-700 flex justify-between items-center">
          <span>
            {invalidLinkReason === "login"
              ? "This archive is only available to signed-in users. Please sign in to access this date."
              : "This archive is outside the available date range."}
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
        <ThemeToggle />
      </div>
      <Card className="border-none shadow-lg dark:bg-gray-800 py-0">
        <CardHeader className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-t-lg py-4">
          <CardTitle className="text-2xl md:text-3xl font-bold">
            WXYC Archive Player
          </CardTitle>
          <CardDescription className="text-purple-100">
            Listen to WXYC programming from the{" "}
            {selectedConfig.dateRange.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block">
                Select Date
              </Label>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => date && setSelectedDate(date)}
                disabled={(date) => date > today || date < allowedStart}
                className="rounded-md border dark:bg-gray-800"
              />
            </div>

            <div className="flex-1">
              <Label className="text-sm font-medium mb-2 block">
                Select Hour
              </Label>
              <Select value={selectedHour} onValueChange={setSelectedHour}>
                <SelectTrigger className="w-full">
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

              <div className="mt-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <h3 className="font-medium text-purple-900 dark:text-purple-100">
                  Selected Archive
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                  {formatDate(selectedDate)} at{" "}
                  {getHourLabel(Number.parseInt(selectedHour))}
                </p>
                <Button
                  className="w-full mt-4 bg-purple-600 hover:bg-purple-700 dark:bg-purple-500 dark:hover:bg-purple-600"
                  onClick={handlePlay}
                  disabled={isLoadingUrl}
                >
                  {isLoadingUrl ? "Loading..." : "Listen Now"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fixed audio player at bottom */}
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
        }}
        config={selectedConfig}
      />
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

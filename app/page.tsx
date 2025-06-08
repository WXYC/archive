"use client";

import { useState, useEffect } from "react";
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

export default function ArchivePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Get date range (today to 2 weeks ago)
  const today = new Date();
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(today.getDate() - 14);

  // Set default to yesterday at noon
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  yesterday.setHours(12, 0, 0, 0);

  // Helper function to parse timestamp from URL
  const parseTimestamp = (
    timestamp: string | null
  ): { date: Date; hour: string } | null => {
    if (!timestamp || timestamp.length !== 12) return null;

    try {
      const year = parseInt(timestamp.slice(0, 4));
      const month = parseInt(timestamp.slice(4, 6)) - 1; // JS months are 0-based
      const day = parseInt(timestamp.slice(6, 8));
      const hour = parseInt(timestamp.slice(8, 10));

      const date = new Date(year, month, day);
      if (isNaN(date.getTime())) return null;

      return {
        date,
        hour: hour.toString(),
      };
    } catch {
      return null;
    }
  };

  // Helper function to create timestamp for URL
  const createTimestamp = (date: Date, hour: number): string => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const day = date.getDate().toString().padStart(2, "0");
    const hourStr = hour.toString().padStart(2, "0");
    return `${year}${month}${day}${hourStr}00`;
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
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [archiveSelected, setArchiveSelected] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

  // Function to update URL with current selection
  const updateUrl = (date: Date, hour: string) => {
    const timestamp = createTimestamp(date, parseInt(hour));
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
            Number.parseInt(selectedHour)
          );
          setAudioUrl(url);
        } catch (error) {
          console.error("Error getting audio URL:", error);
          setAudioUrl(null);
        } finally {
          setIsLoadingUrl(false);
        }
      }
    }

    updateAudioUrl();
  }, [selectedDate, selectedHour, archiveSelected]);

  const handlePlay = () => {
    setArchiveSelected(true);
    setIsPlaying(true);
  };

  // Update handler for hour changes to include date
  const handleHourChange = (newHour: number, newDate: Date) => {
    // Check if the new date is within the allowed range
    if (newDate > today || newDate < twoWeeksAgo) {
      return; // Don't update if outside the allowed range
    }

    setSelectedDate(newDate);
    setSelectedHour(newHour.toString());
  };

  return (
    <div className="container mx-auto px-4 py-8 pb-32 max-w-4xl min-h-screen">
      <div className="hidden md:flex justify-end mb-4">
        <ThemeToggle />
      </div>
      <Card className="border-none shadow-lg dark:bg-gray-800 py-0">
        <CardHeader className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-t-lg py-4">
          <CardTitle className="text-2xl md:text-3xl font-bold">
            WXYC Archive Player
          </CardTitle>
          <CardDescription className="text-purple-100">
            Listen to WXYC programming from the past two weeks
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
                disabled={(date) => date > today || date < twoWeeksAgo}
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
        archiveSelected={archiveSelected}
        onHourChange={handleHourChange}
      />
    </div>
  );
}

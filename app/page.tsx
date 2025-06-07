"use client";

import { useState, useEffect } from "react";
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

export default function ArchivePage() {
  // Get date range (today to 2 weeks ago)
  const today = new Date();
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(today.getDate() - 14);

  // State
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [selectedHour, setSelectedHour] = useState<string>("12");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [archiveSelected, setArchiveSelected] = useState(false);
  const [isLoadingUrl, setIsLoadingUrl] = useState(false);

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
      <Card className="border-none shadow-lg">
        <CardHeader className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-t-lg">
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
                className="rounded-md border"
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

              <div className="mt-6 p-4 bg-purple-50 rounded-lg">
                <h3 className="font-medium text-purple-900">
                  Selected Archive
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {formatDate(selectedDate)} at{" "}
                  {getHourLabel(Number.parseInt(selectedHour))}
                </p>
                <Button
                  className="w-full mt-4 bg-purple-600 hover:bg-purple-700"
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

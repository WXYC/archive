"use client";

import { useState, useRef, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  SkipBack,
  SkipForward,
  Download,
} from "lucide-react";
import { formatTime } from "@/lib/utils";
import { ArchiveConfig } from "@/config/archive";
import { useAuth } from "@/lib/auth";
import { ShareDialog } from "@/components/share-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AudioPlayerProps {
  audioUrl: string | null;
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  selectedDate: Date;
  selectedHour: number;
  selectedMinute: number;
  selectedSecond: number;
  archiveSelected: boolean;
  onHourChange: (hour: number, date: Date) => void;
  onTimeUpdate: (minute: number, second: number) => void;
  config: ArchiveConfig;
}

export default function AudioPlayer({
  audioUrl,
  isPlaying,
  setIsPlaying,
  selectedDate,
  selectedHour,
  selectedMinute,
  selectedSecond,
  archiveSelected,
  onHourChange,
  config,
}: AudioPlayerProps) {
  const { isAuthenticated } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Handle play/pause
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  // Handle mute toggle
  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // Handle seeking with debounce for mobile
  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      const newTime = value[0];
      setCurrentTime(newTime);
      // Use requestAnimationFrame to ensure smooth scrubbing on mobile
      requestAnimationFrame(() => {
        if (audioRef.current) {
          audioRef.current.currentTime = newTime;
        }
      });
    }
  };

  // Update the changeHour function to handle day changes and respect date range
  const changeHour = (hours: number) => {
    const newDate = new Date(selectedDate);
    let newHour = selectedHour + hours;

    // Handle day changes
    if (newHour < 0) {
      newHour = 23;
      newDate.setDate(newDate.getDate() - 1);
    } else if (newHour > 23) {
      newHour = 0;
      newDate.setDate(newDate.getDate() + 1);
    }

    // Check if the new date is within the allowed range
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - config.dateRange.days);

    if (newDate > today || newDate < startDate) {
      return; // Don't update if outside the allowed range
    }

    onHourChange(newHour, newDate);
  };

  // Update handler for when audio ends
  const handleAudioEnded = () => {
    setIsTransitioning(true);
    // Move to next hour
    const newDate = new Date(selectedDate);
    let newHour = selectedHour + 1;

    // Handle day change
    if (newHour > 23) {
      newHour = 0;
      newDate.setDate(newDate.getDate() + 1);
    }

    // Check if the new date is within the allowed range
    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - config.dateRange.days);

    if (newDate > today || newDate < startDate) {
      // If outside range, stop playing
      setIsPlaying(false);
      setIsTransitioning(false);
      return;
    }

    // Update to next hour and keep playing
    onHourChange(newHour, newDate);
  };

  // Update audio element when URL changes
  useEffect(() => {
    if (audioUrl) {
      setIsLoading(true);
      setError(null);
      // Remove setting initial time here as it might be too early
    } else {
      setIsLoading(false);
      setError(null);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
    }
  }, [audioUrl, setIsPlaying]);

  // Update audio play state when isPlaying changes
  useEffect(() => {
    if (audioRef.current && audioUrl) {
      if (isPlaying) {
        audioRef.current.play().catch((err) => {
          console.error("Error playing audio:", err);
          setIsPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, audioUrl, setIsPlaying]);

  // Handle loaded metadata
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      setIsLoading(false);

      // Set initial time after metadata is loaded
      const initialTime = selectedMinute * 60 + selectedSecond;
      audioRef.current.currentTime = initialTime;
      setCurrentTime(initialTime);

      if (isTransitioning) {
        // If we're transitioning between tracks, start playing immediately
        audioRef.current.play().catch((err) => {
          console.error("Error playing audio:", err);
          setIsPlaying(false);
        });
        setIsTransitioning(false);
      }
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    window.open(audioUrl, "_blank");
  };

  return (
    <TooltipProvider>
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="container mx-auto max-w-4xl">
          <div className="flex flex-col gap-4">
            {/* Mobile scrubber with times */}
            <div className="sm:hidden flex flex-col gap-2">
              <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
              <Slider
                value={[currentTime]}
                max={duration}
                step={1}
                onValueChange={handleSeek}
                className="w-full"
              />
            </div>

            {/* Main controls row */}
            <div className="flex items-center justify-between gap-2 sm:gap-2">
              <div className="flex items-center gap-4 sm:gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => changeHour(-1)}
                      disabled={!archiveSelected || isTransitioning}
                      className="h-10 w-10 sm:h-9 sm:w-9"
                    >
                      <SkipBack className="h-5 w-5 sm:h-4 sm:w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Previous hour</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={togglePlayPause}
                      disabled={!audioUrl || isLoading}
                      className="h-10 w-10 sm:h-9 sm:w-9"
                    >
                      {isLoading ? (
                        <div className="h-5 w-5 sm:h-4 sm:w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : isPlaying ? (
                        <Pause className="h-5 w-5 sm:h-4 sm:w-4" />
                      ) : (
                        <Play className="h-5 w-5 sm:h-4 sm:w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isPlaying ? "Pause" : "Play"}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => changeHour(1)}
                      disabled={!archiveSelected || isTransitioning}
                      className="h-10 w-10 sm:h-9 sm:w-9"
                    >
                      <SkipForward className="h-5 w-5 sm:h-4 sm:w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Next hour</TooltipContent>
                </Tooltip>
              </div>

              {/* Desktop scrubber with times */}
              <div className="hidden sm:flex flex-1 items-center gap-2 min-w-0">
                <span className="text-sm text-gray-500 dark:text-gray-400 w-12 shrink-0">
                  {formatTime(currentTime)}
                </span>
                <Slider
                  value={[currentTime]}
                  max={duration}
                  step={1}
                  onValueChange={handleSeek}
                  className="flex-1"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400 w-12 shrink-0">
                  {formatTime(duration)}
                </span>
              </div>

              <div className="flex items-center gap-4 sm:gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={toggleMute}
                      disabled={!audioUrl}
                      className="h-10 w-10 sm:h-9 sm:w-9"
                    >
                      {isMuted ? (
                        <VolumeX className="h-5 w-5 sm:h-4 sm:w-4" />
                      ) : (
                        <Volume2 className="h-5 w-5 sm:h-4 sm:w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
                </Tooltip>

                {isAuthenticated && audioUrl && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleDownload}
                        className="h-10 w-10 sm:h-9 sm:w-9"
                      >
                        <Download className="h-5 w-5 sm:h-4 sm:w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download MP3</TooltipContent>
                  </Tooltip>
                )}

                <ShareDialog
                  selectedDate={selectedDate}
                  selectedHour={selectedHour}
                  currentTime={currentTime}
                  disabled={!audioUrl}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-2 text-sm text-red-500 dark:text-red-400">
              {error}
            </div>
          )}

          <audio
            ref={audioRef}
            src={audioUrl || undefined}
            onTimeUpdate={() =>
              audioRef.current && setCurrentTime(audioRef.current.currentTime)
            }
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onError={() => {
              setError("Error loading audio file. Please try another archive.");
              setIsLoading(false);
              setIsPlaying(false);
              setIsTransitioning(false);
            }}
            onLoadStart={() => setIsLoading(true)}
            onEnded={handleAudioEnded}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

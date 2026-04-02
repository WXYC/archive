"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
import { formatTime, getArchiveUrl } from "@/lib/utils";
import { ArchiveConfig } from "@/config/archive";
import { useAuth } from "@/lib/auth";
import posthog from "posthog-js";
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
  /** Target time in seconds for external seek (e.g., from playlist click) */
  seekToSeconds?: number | null;
  /** Incrementing counter that triggers the seek when changed */
  seekRequestId?: number;
  /** Token getter for preloading next hour's presigned URL */
  getToken?: () => Promise<string | null>;
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
  onTimeUpdate,
  config,
  seekToSeconds,
  seekRequestId,
  getToken,
}: AudioPlayerProps) {
  const { isAuthenticated } = useAuth();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const preloadRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [preloadedNextHour, setPreloadedNextHour] = useState<{
    url: string;
    hour: number;
    date: Date;
  } | null>(null);

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

  // Handle hour changes with day wrapping and date range checks
  const changeHour = useCallback((hours: number) => {
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
  }, [selectedDate, selectedHour, config.dateRange.days, onHourChange]);

  // Track the audio position before a slider drag begins
  const seekStartRef = useRef<number | null>(null);

  const archiveDateISO = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`;

  // Handle keyboard events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keyboard events if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault(); // Prevent page scroll
          if (audioUrl && !isLoading) {
            togglePlayPause();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) {
            if (archiveSelected && !isTransitioning) {
              changeHour(-1);
            }
          } else if (audioRef.current && audioUrl) {
            const fromTime = audioRef.current.currentTime;
            const newTime = Math.max(0, fromTime - 5);
            audioRef.current.currentTime = newTime;
            setCurrentTime(newTime);
            posthog.capture("archive_seek", {
              seek_from_seconds: Math.round(fromTime),
              seek_to_seconds: Math.round(newTime),
              seek_source: "keyboard",
              archive_date: archiveDateISO,
              archive_hour: selectedHour,
            });
          }
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) {
            if (archiveSelected && !isTransitioning) {
              changeHour(1);
            }
          } else if (audioRef.current && audioUrl) {
            const fromTime = audioRef.current.currentTime;
            const newTime = Math.min(
              audioRef.current.duration,
              fromTime + 5
            );
            audioRef.current.currentTime = newTime;
            setCurrentTime(newTime);
            posthog.capture("archive_seek", {
              seek_from_seconds: Math.round(fromTime),
              seek_to_seconds: Math.round(newTime),
              seek_source: "keyboard",
              archive_date: archiveDateISO,
              archive_hour: selectedHour,
            });
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioUrl, isLoading, togglePlayPause, archiveSelected, isTransitioning, changeHour, archiveDateISO, selectedHour]);

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
      // Record the position before the first move of a drag
      if (seekStartRef.current === null) {
        seekStartRef.current = audioRef.current.currentTime;
      }
      const newTime = value[0];
      console.log("[Audio] Seeking:", {
        from: audioRef.current.currentTime,
        to: newTime,
        readyState: audioRef.current.readyState,
        networkState: audioRef.current.networkState,
      });
      setCurrentTime(newTime);
      // Use requestAnimationFrame to ensure smooth scrubbing on mobile
      requestAnimationFrame(() => {
        if (audioRef.current) {
          audioRef.current.currentTime = newTime;
          console.log("[Audio] After seek:", {
            currentTime: audioRef.current.currentTime,
            readyState: audioRef.current.readyState,
          });
        }
      });
    }
  };

  const handleSeekCommit = (value: number[]) => {
    posthog.capture("archive_seek", {
      seek_from_seconds: Math.round(seekStartRef.current ?? 0),
      seek_to_seconds: Math.round(value[0]),
      seek_source: "slider",
      archive_date: archiveDateISO,
      archive_hour: selectedHour,
    });
    seekStartRef.current = null;
  };

  // Preload the next hour's MP3 when approaching the end of the current one.
  // The browser only fetches enough to start playback (HTTP range requests), not the full file.
  useEffect(() => {
    if (!getToken || duration === 0 || currentTime < duration - 15) return;
    if (preloadedNextHour) return; // Already preloading

    const nextDate = new Date(selectedDate);
    let nextHour = selectedHour + 1;
    if (nextHour > 23) {
      nextHour = 0;
      nextDate.setDate(nextDate.getDate() + 1);
    }

    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - config.dateRange.days);
    if (nextDate > today || nextDate < startDate) return;

    (async () => {
      try {
        const token = await getToken();
        const url = await getArchiveUrl(nextDate, nextHour, token);
        setPreloadedNextHour({ url, hour: nextHour, date: nextDate });
        if (preloadRef.current) {
          preloadRef.current.src = url;
          preloadRef.current.load();
        }
      } catch {
        // Preload is best-effort; fail silently
      }
    })();
  }, [currentTime, duration, getToken, preloadedNextHour, selectedDate, selectedHour, config.dateRange.days]);

  // Reset preload when hour changes manually
  useEffect(() => {
    setPreloadedNextHour(null);
    if (preloadRef.current) {
      preloadRef.current.removeAttribute("src");
      preloadRef.current.load();
    }
  }, [selectedHour, selectedDate]);

  // Update handler for when audio ends
  const handleAudioEnded = () => {
    // Try to use preloaded audio for gapless transition
    if (
      preloadedNextHour &&
      preloadRef.current &&
      preloadRef.current.readyState >= 2
    ) {
      // Swap: start playing preloaded audio immediately
      preloadRef.current.play().catch(console.error);

      // Swap refs so the preloaded element becomes the active one
      const temp = audioRef.current;
      audioRef.current = preloadRef.current;
      preloadRef.current = temp;

      // Advance hour state
      onHourChange(preloadedNextHour.hour, preloadedNextHour.date);
      setPreloadedNextHour(null);
      return;
    }

    // Fallback: standard hour transition (with brief gap)
    setIsTransitioning(true);
    const newDate = new Date(selectedDate);
    let newHour = selectedHour + 1;

    if (newHour > 23) {
      newHour = 0;
      newDate.setDate(newDate.getDate() + 1);
    }

    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - config.dateRange.days);

    if (newDate > today || newDate < startDate) {
      setIsPlaying(false);
      setIsTransitioning(false);
      return;
    }

    onHourChange(newHour, newDate);
  };

  // Update audio element when URL changes
  useEffect(() => {
    if (audioUrl) {
      console.log("[Audio] URL changed:", {
        url: audioUrl,
        readyState: audioRef.current?.readyState,
        networkState: audioRef.current?.networkState,
      });
      setIsLoading(true);
      setError(null);
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
      console.log("[Audio] Play state changing:", {
        isPlaying,
        readyState: audioRef.current.readyState,
        currentTime: audioRef.current.currentTime,
      });
      if (isPlaying) {
        audioRef.current.play().catch((err) => {
          console.error("[Audio] Error playing audio:", err);
          setIsPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, audioUrl, setIsPlaying]);

  // Handle external seek requests (e.g., from playlist click)
  useEffect(() => {
    if (
      seekRequestId !== undefined &&
      seekRequestId > 0 &&
      seekToSeconds != null &&
      audioRef.current &&
      audioRef.current.readyState >= 2
    ) {
      const fromTime = audioRef.current.currentTime;
      audioRef.current.currentTime = seekToSeconds;
      setCurrentTime(seekToSeconds);
      onTimeUpdate(
        Math.floor(seekToSeconds / 60),
        Math.floor(seekToSeconds % 60)
      );
      posthog.capture("archive_seek", {
        seek_from_seconds: Math.round(fromTime),
        seek_to_seconds: Math.round(seekToSeconds),
        seek_source: "playlist_entry",
        archive_date: archiveDateISO,
        archive_hour: selectedHour,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on seekRequestId change
  }, [seekRequestId]);

  // Handle loaded metadata
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      console.log("[Audio] Metadata loaded:", {
        duration: audioRef.current.duration,
        readyState: audioRef.current.readyState,
        networkState: audioRef.current.networkState,
        currentTime: audioRef.current.currentTime,
        selectedMinute,
        selectedSecond,
        initialTime: selectedMinute * 60 + selectedSecond,
      });
      setDuration(audioRef.current.duration);
      setIsLoading(false);

      // Set initial time after metadata is loaded
      const initialTime = selectedMinute * 60 + selectedSecond;
      console.log("[Audio] Attempting to set initial time:", initialTime);

      // Ensure the audio is ready before setting time and playing
      if (audioRef.current.readyState >= 2) {
        // HAVE_CURRENT_DATA
        audioRef.current.currentTime = initialTime;
        console.log("[Audio] After setting initial time:", {
          currentTime: audioRef.current.currentTime,
          readyState: audioRef.current.readyState,
        });
        setCurrentTime(initialTime);
        // Update the time display
        onTimeUpdate(
          Math.floor(initialTime / 60),
          Math.floor(initialTime % 60)
        );

        if (isTransitioning) {
          // If we're transitioning between tracks, start playing immediately
          audioRef.current.play().catch((err) => {
            console.error("[Audio] Error playing audio:", err);
            setIsPlaying(false);
          });
          setIsTransitioning(false);
        }
      } else {
        // If not ready, wait for canplay event
        const handleCanPlay = () => {
          console.log("[Audio] Can play event fired, setting time now");
          if (audioRef.current) {
            audioRef.current.currentTime = initialTime;
            setCurrentTime(initialTime);
            // Update the time display
            onTimeUpdate(
              Math.floor(initialTime / 60),
              Math.floor(initialTime % 60)
            );

            if (isTransitioning) {
              audioRef.current.play().catch((err) => {
                console.error("[Audio] Error playing audio:", err);
                setIsPlaying(false);
              });
              setIsTransitioning(false);
            }
            audioRef.current.removeEventListener("canplay", handleCanPlay);
          }
        };
        audioRef.current.addEventListener("canplay", handleCanPlay);
      }
    }
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    window.open(audioUrl, "_blank");
  };

  return (
    <TooltipProvider>
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div>
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
                onValueCommit={handleSeekCommit}
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
                  onValueCommit={handleSeekCommit}
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
            onTimeUpdate={() => {
              if (audioRef.current) {
                const currentTime = audioRef.current.currentTime;
                setCurrentTime(currentTime);
                // Update the time display during playback
                onTimeUpdate(
                  Math.floor(currentTime / 60),
                  Math.floor(currentTime % 60)
                );
              }
            }}
            onLoadedMetadata={handleLoadedMetadata}
            onPlay={() => {
              console.log("[Audio] Play event fired:", {
                currentTime: audioRef.current?.currentTime,
                readyState: audioRef.current?.readyState,
              });
              setIsPlaying(true);
            }}
            onPause={() => {
              console.log("[Audio] Pause event fired:", {
                currentTime: audioRef.current?.currentTime,
                readyState: audioRef.current?.readyState,
              });
              setIsPlaying(false);
            }}
            onError={() => {
              console.error("[Audio] Error event:", {
                error: audioRef.current?.error,
                readyState: audioRef.current?.readyState,
                networkState: audioRef.current?.networkState,
              });
              setError("Error loading audio file. Please try another archive.");
              setIsLoading(false);
              setIsPlaying(false);
              setIsTransitioning(false);
            }}
            onLoadStart={() => {
              console.log("[Audio] Load start:", {
                readyState: audioRef.current?.readyState,
                networkState: audioRef.current?.networkState,
              });
              setIsLoading(true);
            }}
            onEnded={handleAudioEnded}
          />

          {/* Hidden preload element for gapless hour transitions */}
          <audio ref={preloadRef} preload="auto" />
        </div>
      </div>
    </TooltipProvider>
  );
}

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
  Radio,
} from "lucide-react";
import { formatTime, formatDate, getHourLabel } from "@/lib/utils";
import { ArchiveConfig } from "@/config/archive";

interface AudioPlayerProps {
  audioUrl: string | null;
  isPlaying: boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  selectedDate: Date;
  selectedHour: number;
  archiveSelected: boolean;
  onHourChange: (hour: number, date: Date) => void;
  config: ArchiveConfig;
}

export default function AudioPlayer({
  audioUrl,
  isPlaying,
  setIsPlaying,
  selectedDate,
  selectedHour,
  archiveSelected,
  onHourChange,
  config,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVolumeControl, setShowVolumeControl] = useState(false);
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

  // Handle volume change
  const handleVolumeChange = (value: number[]) => {
    const newVolume = value[0];
    setVolume(newVolume);
    if (audioRef.current) {
      audioRef.current.volume = newVolume;
    }
    if (newVolume === 0) {
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  };

  // Handle mute toggle
  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  // Handle seeking
  const handleSeek = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
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
      setCurrentTime(0);
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

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg z-50">
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

      {/* Progress bar at the very top */}
      <div className="w-full h-1 bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full bg-purple-600 dark:bg-purple-500 transition-all duration-100"
          style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
        ></div>
      </div>

      <div className="container mx-auto px-4 py-3 flex items-center">
        {/* Play/Pause and Skip Controls */}
        <div className="flex items-center space-x-2 mr-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => changeHour(-1)}
            disabled={isLoading || !audioUrl}
            title="Previous Hour"
            className="dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={togglePlayPause}
            disabled={isLoading || !audioUrl}
            className="h-10 w-10 rounded-full hover:bg-purple-100 dark:hover:bg-purple-900/30"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 text-purple-700 dark:text-purple-400" />
            ) : (
              <Play className="h-5 w-5 ml-0.5 text-purple-700 dark:text-purple-400" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => changeHour(1)}
            disabled={isLoading || !audioUrl}
            title="Next Hour"
            className="dark:text-gray-300 dark:hover:bg-gray-700"
          >
            <SkipForward className="h-4 w-4" />
          </Button>
        </div>

        {/* Time and Progress */}
        <div className="hidden sm:flex items-center space-x-2 flex-1 max-w-md">
          <span className="text-xs text-gray-500 dark:text-gray-400 w-12">
            {formatTime(currentTime)}
          </span>
          <Slider
            value={[currentTime]}
            max={duration}
            step={1}
            onValueChange={handleSeek}
            className="flex-1"
          />
          <span className="text-xs text-gray-500 dark:text-gray-400 w-12">
            {formatTime(duration)}
          </span>
        </div>

        {/* Now Playing Info */}
        <div className="flex-1 mx-4 truncate">
          {isLoading ? (
            <div className="text-sm font-medium animate-pulse">
              Loading archive...
            </div>
          ) : error ? (
            <div className="text-sm text-red-500">{error}</div>
          ) : archiveSelected && audioUrl ? (
            <div className="flex items-center">
              <Radio className="h-5 w-5 text-purple-600 mr-2" />
              <div className="truncate">
                <div className="text-sm font-medium">WXYC Archive</div>
                <div className="text-xs text-gray-500 truncate">
                  {formatDate(selectedDate)} at {getHourLabel(selectedHour)}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">
              Select a date and time, then click "Listen Now"
            </div>
          )}
        </div>

        {/* Volume Control */}
        <div className="flex items-center space-x-2 ml-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleMute}
            className="dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <div
            className={`relative ${
              showVolumeControl ? "w-24" : "w-0"
            } transition-all duration-200 overflow-hidden`}
          >
            <Slider
              value={[volume]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={handleVolumeChange}
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="absolute top-0 left-0 right-0 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm p-2 text-center">
          {error}
        </div>
      )}
    </div>
  );
}

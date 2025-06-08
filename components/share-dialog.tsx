"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Share2, Check, Copy } from "lucide-react";
import { createTimestamp } from "@/lib/utils";

interface ShareDialogProps {
  selectedDate: Date;
  selectedHour: number;
  currentTime: number;
}

export function ShareDialog({
  selectedDate,
  selectedHour,
  currentTime,
}: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const [includeTime, setIncludeTime] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    const baseUrl = window.location.origin + window.location.pathname;
    const timestamp = createTimestamp(
      selectedDate,
      selectedHour,
      includeTime ? Math.floor(currentTime / 60) : 0,
      includeTime ? Math.floor(currentTime % 60) : 0
    );
    setShareUrl(`${baseUrl}?t=${timestamp}`);
  }, [selectedDate, selectedHour, currentTime, includeTime]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Share">
          <Share2 className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Archive</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="includeTime"
              checked={includeTime}
              onChange={(e) => setIncludeTime(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="includeTime" className="text-sm">
              Include current playback position
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={shareUrl}
              readOnly
              className="flex-1 px-3 py-2 text-sm border rounded-md bg-gray-50 dark:bg-gray-800"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleCopy}
              className="shrink-0"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { Music, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArchivePlaylistEntry } from "@/lib/types/playlist";

interface TrackInfoPanelProps {
  entry: ArchivePlaylistEntry;
  onClose: () => void;
}

export function TrackInfoPanel({ entry, onClose }: TrackInfoPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Close button */}
      <div className="flex justify-end p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onClose}
        >
          <XCircle className="h-5 w-5 text-gray-400" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {/* Large artwork */}
        <div className="w-full aspect-square rounded-lg bg-gray-200 dark:bg-gray-700 flex items-center justify-center overflow-hidden mb-4">
          {entry.artworkUrl ? (
            <img
              src={entry.artworkUrl}
              alt={`${entry.releaseTitle} artwork`}
              className="w-full h-full object-cover"
            />
          ) : (
            <Music className="w-12 h-12 text-gray-400 dark:text-gray-500" />
          )}
        </div>

        {/* Title / Artist / Album */}
        <div className="text-center mb-4">
          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {entry.songTitle || "Unknown Track"}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {entry.artistName || "Unknown Artist"}
          </p>
          {entry.releaseTitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {entry.releaseTitle}
            </p>
          )}
        </div>

        {/* Metadata grid */}
        <div className="space-y-3 mb-4">
          {entry.labelName && (
            <MetadataRow label="Label" value={entry.labelName} />
          )}
          {entry.metadata?.genre && (
            <MetadataRow label="Genre" value={entry.metadata.genre} />
          )}
          {entry.metadata?.format && (
            <MetadataRow label="Format" value={entry.metadata.format} />
          )}
          {entry.metadata?.callNumber && (
            <MetadataRow label="Call Number" value={entry.metadata.callNumber} mono />
          )}
        </div>

        {/* Badges */}
        {(entry.rotation || entry.request) && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {entry.rotation && (
              <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded">
                Rotation
              </span>
            )}
            {entry.request && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded">
                Request
              </span>
            )}
          </div>
        )}

        {/* External links */}
        {entry.metadata?.discogsUrl && (
          <div className="border-t dark:border-gray-700 pt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">More Info</p>
            <a
              href={entry.metadata.discogsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
            >
              Discogs <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function MetadataRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex-shrink-0">
        {label}
      </span>
      <span className={`text-sm text-gray-900 dark:text-gray-100 text-right ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

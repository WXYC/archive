"use client";

import { Music, XCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ArchivePlaylistEntry } from "@/lib/types/playlist";

interface TrackInfoPanelProps {
  entry: ArchivePlaylistEntry;
  onClose: () => void;
}

function buildSearchUrl(base: string, artist: string, song?: string): string {
  const query = song ? `${artist} ${song}` : artist;
  return `${base}${encodeURIComponent(query)}`;
}

interface StreamingService {
  name: string;
  url: string;
  icon: string;
}

function getStreamingLinks(entry: ArchivePlaylistEntry): StreamingService[] {
  const artist = entry.artistName;
  const song = entry.songTitle;
  if (!artist) return [];

  const links: StreamingService[] = [];
  const searchTerm = song || entry.releaseTitle || "";

  if (searchTerm) {
    links.push({
      name: "Spotify",
      url: buildSearchUrl("https://open.spotify.com/search/", artist, searchTerm),
      icon: "spotify",
    });
    links.push({
      name: "YouTube Music",
      url: buildSearchUrl("https://music.youtube.com/search?q=", artist, searchTerm),
      icon: "youtube",
    });
    links.push({
      name: "Bandcamp",
      url: buildSearchUrl("https://bandcamp.com/search?q=", artist, searchTerm),
      icon: "bandcamp",
    });
    links.push({
      name: "SoundCloud",
      url: buildSearchUrl("https://soundcloud.com/search?q=", artist, searchTerm),
      icon: "soundcloud",
    });
  }

  return links;
}

export function TrackInfoPanel({ entry, onClose }: TrackInfoPanelProps) {
  const streamingLinks = getStreamingLinks(entry);

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

        {/* Metadata */}
        <div className="space-y-3 mb-4">
          {entry.labelName && (
            <MetadataRow label="Label" value={entry.labelName} />
          )}
        </div>

        {/* Streaming links */}
        {streamingLinks.length > 0 && (
          <div className="border-t dark:border-gray-700 pt-3 mb-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
              Add it to your library
            </p>
            <div className="grid grid-cols-2 gap-2">
              {streamingLinks.map((service) => (
                <a
                  key={service.name}
                  href={service.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
                >
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{service.name}</span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* External links */}
        {entry.metadata?.discogsUrl && (
          <div className="border-t dark:border-gray-700 pt-3">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
              More Info
            </p>
            <a
              href={entry.metadata.discogsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300 w-fit"
            >
              <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
              Discogs
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex-shrink-0">
        {label}
      </span>
      <span className="text-sm text-gray-900 dark:text-gray-100 text-right">
        {value}
      </span>
    </div>
  );
}

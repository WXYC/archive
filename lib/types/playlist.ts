/**
 * Raw entry from the tubafrenzy /hourlyEntries endpoint.
 * Field names match tubafrenzy's Java/JSON conventions (camelCase).
 */
export interface TubafrenzyEntry {
  id: number;
  chronOrderID: number;
  /** Radio hour as epoch milliseconds */
  hour: number;
  /** Entry creation time as epoch milliseconds */
  timeCreated: number;
  entryType: "playcut" | "talkset" | "breakpoint";
  /** Playcut fields (present when entryType === "playcut") */
  artistName?: string;
  songTitle?: string;
  releaseTitle?: string;
  labelName?: string;
  rotation?: string;
  request?: string;
  /** Breakpoint label (present when entryType === "breakpoint") */
  label?: string;
}

/**
 * A playlist entry enriched with computed offset and optional artwork.
 * Used on the client side for rendering and playhead sync.
 */
export interface ArchivePlaylistEntry {
  id: number;
  entryType: "playcut" | "talkset" | "breakpoint";
  /** Seconds into the hour (for playhead sync) */
  offsetSeconds: number;
  /** Playcut fields */
  artistName?: string;
  songTitle?: string;
  releaseTitle?: string;
  labelName?: string;
  rotation?: boolean;
  request?: boolean;
  /** Breakpoint label */
  label?: string;
  /** Album artwork URL from library-metadata-lookup (added in PR 4) */
  artworkUrl?: string | null;
  /** Whether artwork is currently being fetched */
  artworkLoading?: boolean;
}

/**
 * Response shape from GET /api/playlist
 */
export interface PlaylistResponse {
  entries: ArchivePlaylistEntry[];
  radioHourEpoch: number;
}

/**
 * Maps a raw tubafrenzy entry to an ArchivePlaylistEntry.
 */
export function mapTubafrenzyEntry(
  entry: TubafrenzyEntry,
  radioHourEpoch: number
): ArchivePlaylistEntry {
  const offsetSeconds = Math.max(
    0,
    Math.floor((entry.timeCreated - radioHourEpoch) / 1000)
  );

  const base: ArchivePlaylistEntry = {
    id: entry.id,
    entryType: entry.entryType,
    offsetSeconds,
  };

  if (entry.entryType === "playcut") {
    base.artistName = entry.artistName ?? "";
    base.songTitle = entry.songTitle ?? "";
    base.releaseTitle = entry.releaseTitle ?? "";
    base.labelName = entry.labelName ?? "";
    base.rotation = entry.rotation === "true";
    base.request = entry.request === "true";
  } else if (entry.entryType === "breakpoint") {
    base.label = entry.label;
  }

  return base;
}

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
  /** Album artwork URL from library-metadata-lookup */
  artworkUrl?: string | null;
  /** Whether artwork is currently being fetched */
  artworkLoading?: boolean;
  /** Additional metadata from library-metadata-lookup */
  metadata?: {
    genre: string | null;
    format: string | null;
    callNumber: string | null;
    libraryUrl: string | null;
    discogsUrl: string | null;
  };
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

// --- Daily playlist types (for show-based timeline) ---

/** Raw response from tubafrenzy /dailyEntries endpoint. */
export interface TubafrenzyDailyResponse {
  shows: TubafrenzyShow[];
  entries: TubafrenzyDailyEntry[];
}

/** Show metadata from tubafrenzy. */
export interface TubafrenzyShow {
  id: number;
  djHandle: string;
  showName: string | null;
  signonTime: number;
  signoffTime: number;
}

/** Raw entry from tubafrenzy /dailyEntries (includes show delimiters + radioShowId). */
export interface TubafrenzyDailyEntry {
  id: number;
  chronOrderID: number;
  hour: number;
  timeCreated: number;
  entryType: "playcut" | "talkset" | "breakpoint" | "showStart" | "showEnd";
  radioShowId: number;
  artistName?: string;
  songTitle?: string;
  releaseTitle?: string;
  labelName?: string;
  rotation?: string;
  request?: string;
  label?: string;
}

/** Entry enriched for daily display. Extends ArchivePlaylistEntry with day-level positioning. */
export interface DailyPlaylistEntry extends ArchivePlaylistEntry {
  /** Seconds since midnight ET (for absolute day positioning) */
  dayOffsetSeconds: number;
  /** Which hour's MP3 this entry belongs to (0-23) */
  hour: number;
  /** Radio show ID this entry belongs to */
  radioShowId: number;
}

/** A show block with its entries, for display. */
export interface ShowBlock {
  showId: number;
  djHandle: string;
  showName: string | null;
  signonTime: number;
  signoffTime: number;
  entries: DailyPlaylistEntry[];
}

/** Response from GET /api/daily-playlist. */
export interface DailyPlaylistResponse {
  shows: ShowBlock[];
  dayStartEpoch: number;
}

/**
 * Maps a raw tubafrenzy daily entry to a DailyPlaylistEntry.
 * The inherited offsetSeconds is always dayOffsetSeconds % 3600 (within-hour offset)
 * for compatibility with the audio player's seek logic.
 */
export function mapTubafrenzyDailyEntry(
  entry: TubafrenzyDailyEntry,
  dayStartEpoch: number
): DailyPlaylistEntry {
  const dayOffsetSeconds = Math.max(
    0,
    Math.min(86400, Math.floor((entry.timeCreated - dayStartEpoch) / 1000))
  );
  const hour = Math.floor(dayOffsetSeconds / 3600);
  const offsetSeconds = dayOffsetSeconds % 3600;

  const base: DailyPlaylistEntry = {
    id: entry.id,
    entryType: entry.entryType as ArchivePlaylistEntry["entryType"],
    offsetSeconds,
    dayOffsetSeconds,
    hour,
    radioShowId: entry.radioShowId,
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

/**
 * Groups daily entries into ShowBlocks using show metadata.
 * Entries not belonging to any known show are grouped into a synthetic "Automation" block.
 */
export function groupEntriesIntoShows(
  entries: DailyPlaylistEntry[],
  shows: TubafrenzyShow[]
): ShowBlock[] {
  const showMap = new Map<number, ShowBlock>();

  for (const show of shows) {
    showMap.set(show.id, {
      showId: show.id,
      djHandle: show.djHandle,
      showName: show.showName,
      signonTime: show.signonTime,
      signoffTime: show.signoffTime,
      entries: [],
    });
  }

  // Collect entries not belonging to any known show
  const orphanEntries: DailyPlaylistEntry[] = [];

  for (const entry of entries) {
    const block = showMap.get(entry.radioShowId);
    if (block) {
      block.entries.push(entry);
    } else {
      orphanEntries.push(entry);
    }
  }

  // Build result: known shows in signon order, plus automation block if needed
  const result = shows.map((s) => showMap.get(s.id)!);

  if (orphanEntries.length > 0) {
    result.push({
      showId: 0,
      djHandle: "Automation",
      showName: null,
      signonTime: 0,
      signoffTime: 0,
      entries: orphanEntries,
    });
  }

  return result;
}

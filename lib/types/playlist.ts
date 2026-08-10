/**
 * A playlist entry enriched with computed offset and optional artwork.
 * Used on the client side for rendering and playhead sync.
 */
/**
 * This app's entry-type vocabulary.
 *
 * Includes the two show delimiters. The panel filters them out of display, but
 * they must survive the mapper as themselves — the tubafrenzy-era code carried
 * them through a `as` cast onto a three-member union that did not admit them,
 * which meant `entryType` lied about its own domain.
 */
export type PlaylistEntryType =
  | "playcut"
  | "talkset"
  | "breakpoint"
  | "showStart"
  | "showEnd"
  | "djJoin"
  | "djLeave"
  | "message"
  | "unknown";

export interface ArchivePlaylistEntry {
  id: number;
  entryType: PlaylistEntryType;
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
    releaseYear: number | null;
    artistBio: string | null;
    wikipediaUrl: string | null;
    spotifyUrl: string | null;
    appleMusicUrl: string | null;
    youtubeMusicUrl: string | null;
    bandcampUrl: string | null;
    soundcloudUrl: string | null;
  };
}

// --- Backend `GET /flowsheet/range` wire types ---
//
// Source of truth for these shapes is `wxyc-shared/api.yaml`
// (`FlowsheetRangeResponse` / `FlowsheetRangeShow` / `FlowsheetRangeEntry`).
// They are declared locally rather than imported because `@wxyc/shared` does
// not publish generated TypeScript for the flowsheet read paths this app uses,
// and hand-declaring the ~6 fields we read is cheaper than taking on the
// codegen. Field names are snake_case on the wire; everything below the mapper
// is this app's own camelCase vocabulary.

/**
 * Backend's flowsheet entry-type vocabulary.
 *
 * Deliberately NOT the same words as {@link ArchivePlaylistEntry.entryType}:
 * Backend says `track` / `show_start` / `show_end` where this app has always
 * said `playcut` / `showStart` / `showEnd`. {@link mapRangeEntry} is the single
 * place the two vocabularies meet — see {@link RANGE_ENTRY_TYPE} — so the
 * player, the panel, and their tests are untouched by the source swap.
 */
export type FlowsheetRangeEntryType =
  | "track"
  | "talkset"
  | "breakpoint"
  | "show_start"
  | "show_end"
  | "dj_join"
  | "dj_leave"
  | "message";

/**
 * One show overlapping the requested window.
 *
 * A public-safe projection: `dj_name` is the DJ's public handle (per-show
 * override -> `user.djName` -> tubafrenzy's legacy `DJ_HANDLE` -> null), never
 * a real name.
 */
export interface FlowsheetRangeShow {
  id: number;
  show_name: string | null;
  dj_name: string | null;
  specialty_id: number | null;
  /** ISO 8601. When the DJ signed on. */
  start_time: string;
  /**
   * ISO 8601, or null. Null has two indistinguishable causes: the show is on
   * the air, or its `show_end` delivery was dropped and the column stayed null
   * permanently. Do not render null as "on air now".
   */
  end_time: string | null;
}

/** One flowsheet row in the requested window. */
export interface FlowsheetRangeEntry {
  id: number;
  /**
   * The show this row belongs to, or null for an **unattributed** row — one
   * that exists with no linked show. 20 rows of 2,619,011 are in that state and
   * the tubafrenzy Phase 0 audit decided against backfilling them, so this
   * endpoint returns them rather than dropping them. The key is always present.
   */
  show_id: number | null;
  play_order: number;
  /** ISO 8601. When the row was logged. */
  add_time: string;
  entry_type: FlowsheetRangeEntryType;
  artist_name?: string | null;
  track_title?: string | null;
  album_title?: string | null;
  record_label?: string | null;
  /** Rotation bin letter (H/M/L/S) when the release is in rotation, else null. */
  rotation_bin?: string | null;
  request_flag?: boolean;
  /** Body text of a talkset or breakpoint row. */
  message?: string | null;
}

/** Raw response from Backend `GET /flowsheet/range?start=&end=`. */
export interface FlowsheetRangeResponse {
  shows: FlowsheetRangeShow[];
  entries: FlowsheetRangeEntry[];
}

/**
 * Backend entry type -> this app's entry type.
 *
 * This must cover `api.yaml`'s `FlowsheetEntryType` enum in full, not just the
 * types a sampled day happens to contain. `dj_join` and `dj_leave` are the ones
 * that catch you out: they only appear when a guest DJ joins a show mid-set, so
 * a single day of production data can easily show none, while five sampled
 * weeks hold 25 of them. A missing key here yields `undefined`, which
 * `JSON.stringify` then drops from the route's response entirely — the entry
 * arrives at the panel with no `entryType` at all.
 */
const RANGE_ENTRY_TYPE: Record<FlowsheetRangeEntryType, PlaylistEntryType> = {
  track: "playcut",
  talkset: "talkset",
  breakpoint: "breakpoint",
  show_start: "showStart",
  show_end: "showEnd",
  dj_join: "djJoin",
  dj_leave: "djLeave",
  message: "message",
};

/**
 * Translate a wire entry type, tolerating one this build has never heard of.
 *
 * Backend can add an enum member before this app is redeployed. Mapping the
 * unknown case to a named `"unknown"` rather than letting it fall through as
 * `undefined` keeps `entryType` a total function of its input: the panel
 * filters on `"playcut"`, so an unrecognized row is simply not displayed,
 * which is the same outcome as today minus the undefined.
 */
const toPlaylistEntryType = (wireType: string): PlaylistEntryType =>
  RANGE_ENTRY_TYPE[wireType as FlowsheetRangeEntryType] ?? "unknown";

// --- Daily playlist types (for show-based timeline) ---

/** Entry enriched for daily display. Extends ArchivePlaylistEntry with day-level positioning. */
export interface DailyPlaylistEntry extends ArchivePlaylistEntry {
  /** Seconds since midnight ET (for absolute day positioning) */
  dayOffsetSeconds: number;
  /** Which hour's MP3 this entry belongs to (0-23) */
  hour: number;
  /**
   * Show this entry belongs to, or null when Backend reports it unattributed.
   * {@link groupEntriesIntoShows} routes nulls to the unattributed block.
   */
  showId: number | null;
}

/** A show block with its entries, for display. */
export interface ShowBlock {
  /** Backend show id, or {@link UNATTRIBUTED_SHOW_ID} for the catch-all block. */
  showId: number;
  djHandle: string;
  showName: string | null;
  /** Epoch ms, or 0 when unknown (the unattributed block). */
  signonTime: number;
  /** Epoch ms, or 0 when the show has no recorded sign-off. */
  signoffTime: number;
  entries: DailyPlaylistEntry[];
}

/** Response from GET /api/daily-playlist. */
export interface DailyPlaylistResponse {
  shows: ShowBlock[];
  dayStartEpoch: number;
}

/**
 * Synthetic id of the catch-all block for entries with no usable show.
 *
 * Zero is safe as a sentinel because Backend's `shows.id` is a serial starting
 * at 1, so no real show can collide with it.
 */
export const UNATTRIBUTED_SHOW_ID = 0;

/** Header shown for the catch-all block. */
export const UNATTRIBUTED_DJ_LABEL = "Unattributed";

/**
 * Header shown for a real show whose DJ handle did not resolve.
 *
 * Deliberately NOT {@link UNATTRIBUTED_DJ_LABEL}. `dj_name` is nullable by
 * contract — the PII-safe chain is per-show override -> `user.djName` ->
 * `shows.legacy_dj_name` -> null — so a genuine show can arrive without a
 * handle. "This show's DJ is unknown" and "these rows belong to no show" are
 * different facts, and one word for both makes them indistinguishable in the
 * panel, which now renders `djHandle` uniformly.
 */
export const UNKNOWN_DJ_LABEL = "Unknown DJ";

/** Seconds in an hour, and the last hour the archive holds an MP3 for. */
const SECONDS_PER_HOUR = 3600;
const LAST_ARCHIVE_HOUR = 23;

/**
 * Maps a Backend range entry to a DailyPlaylistEntry.
 *
 * The inherited `offsetSeconds` is always `dayOffsetSeconds % 3600` (within-hour
 * offset) for compatibility with the audio player's seek logic, and `hour` is
 * the whole-hour part of the same quantity — which is how the hour picker
 * indexes the day's MP3s.
 *
 * That derivation is elapsed-time-based, so on the two DST-transition days a
 * year it drifts from the ET clock hour: the archive stores one MP3 per elapsed
 * hour but the picker offers a fixed 0-23, and one of the two 1 AMs on the
 * fall-back day has nowhere to go. This is inherited behaviour, not new — the
 * tubafrenzy-sourced mapper computed `hour` exactly the same way. What did
 * change is the clamp: it now uses the real end of the day (`dayEndEpoch`)
 * rather than a hardcoded 86,400 seconds, so a 25-hour day no longer collapses
 * its last hour of entries onto midnight.
 *
 * Widening that clamp is exactly why `hour` is now clamped too. `hour` is not
 * a description — it selects an MP3. `app/page.tsx` feeds it to
 * `setSelectedHour`, and `getArchiveUrl` pads it into the S3 key
 * `YYYY/MM/DD/YYYYMMDDHH00.mp3`. On the 25-hour fall-back day the widened
 * clamp lets `dayOffsetSeconds` reach 89,999, and `floor(89999 / 3600)` is 24,
 * which builds `…2400.mp3` — an object that does not exist. Clicking any track
 * in that hour, or pressing J/K into it, would 404 and kill playback. Pinning
 * to hour 23 puts those entries on the last MP3 that does exist. Their
 * within-hour offset is then wrong by up to an hour, which is a seek landing in
 * the wrong place — a far smaller failure than a dead player, and confined to
 * one hour, one day a year.
 *
 * @param entry Raw row from `GET /flowsheet/range`.
 * @param dayStartEpoch Epoch ms of midnight ET on the requested day.
 * @param dayEndEpoch Epoch ms of midnight ET on the following day.
 */
export function mapRangeEntry(
  entry: FlowsheetRangeEntry,
  dayStartEpoch: number,
  dayEndEpoch: number
): DailyPlaylistEntry {
  const addTimeMs = Date.parse(entry.add_time);
  const dayLengthSeconds = Math.floor((dayEndEpoch - dayStartEpoch) / 1000);
  // Number.isNaN guard: an unparseable add_time would otherwise propagate NaN
  // into dayOffsetSeconds and knock the entry out of every playhead comparison
  // silently. Pin it to the start of the day instead, where it is at least
  // visible in the panel.
  const dayOffsetSeconds = Number.isNaN(addTimeMs)
    ? 0
    : Math.max(
        0,
        Math.min(
          dayLengthSeconds,
          Math.floor((addTimeMs - dayStartEpoch) / 1000)
        )
      );
  // `LAST_ARCHIVE_HOUR`, not 24: see the note above on the fall-back day.
  const hour = Math.min(LAST_ARCHIVE_HOUR, Math.floor(dayOffsetSeconds / 3600));
  const offsetSeconds = Math.min(
    SECONDS_PER_HOUR,
    dayOffsetSeconds - hour * SECONDS_PER_HOUR
  );

  const base: DailyPlaylistEntry = {
    id: entry.id,
    entryType: toPlaylistEntryType(entry.entry_type),
    offsetSeconds,
    dayOffsetSeconds,
    hour,
    showId: entry.show_id,
  };

  if (entry.entry_type === "track") {
    base.artistName = entry.artist_name ?? "";
    base.songTitle = entry.track_title ?? "";
    base.releaseTitle = entry.album_title ?? "";
    base.labelName = entry.record_label ?? "";
    // Backend reports rotation as the bin letter (H/M/L/S) or null, where
    // tubafrenzy reported the string "true"/"false". Presence of a bin is the
    // boolean this app wants.
    base.rotation = entry.rotation_bin != null;
    base.request = entry.request_flag === true;
  } else if (entry.message != null) {
    // Not breakpoint-only: `message` is the body text of a talkset or a
    // free-text message row too, and Backend emits it for all three. The
    // tubafrenzy mapper read it only for breakpoints because the field did not
    // exist on the other types there; carrying it through means a future
    // consumer can render talkset text without another pass at the adapter.
    base.label = entry.message;
  }

  return base;
}

/**
 * Groups daily entries into ShowBlocks using show metadata.
 *
 * Two kinds of entry land in the trailing catch-all block rather than a show of
 * their own, and they are not the same thing:
 *
 *   1. `show_id: null` — Backend reports the row as genuinely unattributed.
 *      20 of 2,619,011 rows are in that state and were deliberately never
 *      backfilled, so the endpoint returns them rather than dropping them.
 *      This case is expected and permanent.
 *   2. `show_id` set but absent from `shows` — defence only. Backend's
 *      `getShowsInTimeWindow` selects shows on three ORed arms, and the third
 *      is `shows.id IN (SELECT DISTINCT show_id FROM flowsheet WHERE add_time
 *      in window)`, added precisely so that every `show_id` an in-window entry
 *      references resolves. So this should never fire against a correct
 *      Backend, and it is NOT — as an earlier revision of this comment
 *      claimed — the ordinary consequence of a dropped `show_end`; that gap is
 *      exactly what the third arm closes. Kept because the alternative to a
 *      catch-all is dropping playable entries on the floor if the contract
 *      ever regresses.
 *
 * Both render under one "Unattributed" header.
 */
export function groupEntriesIntoShows(
  entries: DailyPlaylistEntry[],
  shows: FlowsheetRangeShow[]
): ShowBlock[] {
  const showMap = new Map<number, ShowBlock>();

  for (const show of shows) {
    // 0 is the panel's "no time to render" sentinel, and both bounds resolve
    // through it. `start_time` gets the same NaN guard as `end_time` and not
    // a bare Date.parse: ShowBlock documents these as "epoch ms, or 0", and a
    // NaN would satisfy neither the value nor the sentinel, leaving no way for
    // a consumer doing arithmetic on signonTime to detect that it is missing.
    const signonTime = show.start_time ? Date.parse(show.start_time) : 0;
    const signoffTime = show.end_time ? Date.parse(show.end_time) : 0;
    showMap.set(show.id, {
      showId: show.id,
      djHandle: show.dj_name ?? UNKNOWN_DJ_LABEL,
      showName: show.show_name,
      signonTime: Number.isNaN(signonTime) ? 0 : signonTime,
      signoffTime: Number.isNaN(signoffTime) ? 0 : signoffTime,
      entries: [],
    });
  }

  const unattributedEntries: DailyPlaylistEntry[] = [];

  for (const entry of entries) {
    const block = entry.showId === null ? undefined : showMap.get(entry.showId);
    if (block) {
      block.entries.push(entry);
    } else {
      unattributedEntries.push(entry);
    }
  }

  // Known shows in start_time order (Backend already sorts them), then the
  // catch-all block if it caught anything.
  const result = shows.map((s) => showMap.get(s.id)!);

  if (unattributedEntries.length > 0) {
    result.push({
      showId: UNATTRIBUTED_SHOW_ID,
      djHandle: UNATTRIBUTED_DJ_LABEL,
      showName: null,
      signonTime: 0,
      signoffTime: 0,
      entries: unattributedEntries,
    });
  }

  return result;
}

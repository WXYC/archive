import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date as MM/DD/YYYY
 */
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format time in HH:MM:SS format
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return [
    hours > 0 ? hours.toString().padStart(1, "0") : null,
    hours > 0 ? minutes.toString().padStart(2, "0") : minutes.toString(),
    secs.toString().padStart(2, "0"),
  ]
    .filter(Boolean)
    .join(":");
}

/**
 * Get a human-readable label for an hour (0-23)
 */
export function getHourLabel(hour: number, minutes: number = 0): string {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  const minutesStr = minutes.toString().padStart(2, "0");
  return `${displayHour}:${minutesStr} ${period}`;
}

/**
 * Construct the S3 URL for an archive based on date and hour
 */
export async function getArchiveUrl(
  date: Date,
  hour: number,
  token: string | null
): Promise<string> {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hourStr = hour.toString().padStart(2, "0");

  const key = `${year}/${month}/${day}/${year}${month}${day}${hourStr}00.mp3`;

  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch("/api/signed-url", {
      method: "POST",
      headers,
      body: JSON.stringify({ key }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to get signed URL");
    }

    return data.url;
  } catch (error) {
    console.error("Error getting signed URL:", error);
    throw error;
  }
}

/**
 * Compute the epoch milliseconds for a radio hour in America/New_York timezone.
 * Tubafrenzy stores radioHour as epoch ms at the hour boundary in Eastern time.
 *
 * @param dateStr ISO date string (YYYY-MM-DD)
 * @param hour Hour of day (0-23)
 * @returns Epoch milliseconds for that hour in Eastern time
 */
export function computeRadioHourEpoch(dateStr: string, hour: number): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  });

  // Try EST (-5) then EDT (-4). One of these will produce the correct
  // Eastern hour for the target date.
  for (const offset of [5, 4]) {
    const candidate = Date.UTC(y, m - 1, d, hour + offset, 0, 0, 0);
    const etHour = parseInt(formatter.format(new Date(candidate)));
    if (etHour === hour) {
      return candidate;
    }
  }

  // Fallback (shouldn't happen for America/New_York)
  return Date.UTC(y, m - 1, d, hour + 5, 0, 0, 0);
}

/**
 * Compute the offset in seconds of an entry within its radio hour.
 *
 * @param entryTimeCreated Entry's timeCreated in epoch ms
 * @param radioHourEpoch Radio hour start in epoch ms
 * @returns Seconds into the hour (clamped to [0, 3600])
 */
export function computeEntryOffsetSeconds(
  entryTimeCreated: number,
  radioHourEpoch: number
): number {
  const offsetMs = entryTimeCreated - radioHourEpoch;
  const offsetSeconds = Math.floor(offsetMs / 1000);
  return Math.max(0, Math.min(3600, offsetSeconds));
}

export function createTimestamp(
  date: Date,
  hour: number,
  minute: number = 0,
  second: number = 0
): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hourStr = hour.toString().padStart(2, "0");
  const minuteStr = minute.toString().padStart(2, "0");
  const secondStr = second.toString().padStart(2, "0");
  return `${year}${month}${day}${hourStr}${minuteStr}${secondStr}`;
}

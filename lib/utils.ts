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
    hours > 0 ? hours.toString().padStart(2, "0") : null,
    hours > 0 ? minutes.toString().padStart(2, "0") : minutes.toString(),
    secs.toString().padStart(2, "0"),
  ]
    .filter(Boolean)
    .join(":");
}

/**
 * Get a human-readable label for an hour (0-23)
 */
export function getHourLabel(hour: number): string {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:00 ${period}`;
}

/**
 * Construct the S3 URL for an archive based on date and hour
 */
export async function getArchiveUrl(
  date: Date,
  hour: number,
  isAuthenticated: boolean
): Promise<string> {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hourStr = hour.toString().padStart(2, "0");

  const key = `${year}/${month}/${day}/${year}${month}${day}${hourStr}00.mp3`;

  try {
    const response = await fetch("/api/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        ...(isAuthenticated && { isAuthenticated: true }),
      }),
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

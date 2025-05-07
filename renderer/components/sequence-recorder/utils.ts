/**
 * Format milliseconds to MM:SS.mmm format
 */
export function formatTime(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

/**
 * Parse time string in MM:SS.mmm format to milliseconds
 */
export function parseTime(timeString: string): number {
  const [minutesSeconds, milliseconds] = timeString.split(".");
  const [minutes, seconds] = minutesSeconds.split(":");

  return (
    Number.parseInt(minutes) * 60000 +
    Number.parseInt(seconds) * 1000 +
    Number.parseInt(milliseconds || "0")
  );
}

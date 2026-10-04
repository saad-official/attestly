/**
 * Display helpers shared by the signed-in screens. Pure (no server-only),
 * so client components can use them too.
 */

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? singular : plural}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "0%";
  return `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%`;
}

function safeTimeZone(timeZone?: string): string | undefined {
  if (!timeZone) return undefined;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return timeZone;
  } catch {
    return undefined;
  }
}

/** "4 Oct 2026" in the organisation's time zone. */
export function formatDate(value: Date | string, timeZone?: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: safeTimeZone(timeZone),
  }).format(date);
}

/** "4 Oct 2026, 14:05" in the organisation's time zone. */
export function formatDateTime(value: Date | string, timeZone?: string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: safeTimeZone(timeZone),
  }).format(date);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Spreadsheet column letter for a 1-based column number (1 → A, 28 → AB). */
export function columnLetter(column: number): string {
  let n = Math.floor(column);
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || "?";
}

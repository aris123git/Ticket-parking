export const DEFAULT_TIMEZONE = "Africa/Ouagadougou";

export function nowIso(): string {
  return new Date().toISOString();
}

export function periodFromDate(date: Date, timeZone = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}${month}`;
}

export function formatDate(iso: string, timeZone = DEFAULT_TIMEZONE): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export function formatTime(iso: string, timeZone = DEFAULT_TIMEZONE): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export function formatDateTime(iso: string, timeZone = DEFAULT_TIMEZONE): string {
  return `${formatDate(iso, timeZone)} ${formatTime(iso, timeZone)}`;
}

export type PeriodFilter = "today" | "yesterday" | "week" | "month" | "custom";

export function periodRange(
  filter: PeriodFilter,
  from?: string,
  to?: string,
  timeZone = DEFAULT_TIMEZONE,
  now = new Date(),
): { start: string; end: string } {
  if (filter === "custom" && from && to) {
    return { start: new Date(from).toISOString(), end: new Date(to).toISOString() };
  }

  const local = zonedParts(now, timeZone);
  const todayStart = zonedDate(local.year, local.month, local.day, timeZone);

  if (filter === "yesterday") {
    const y = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    return { start: y.toISOString(), end: todayStart.toISOString() };
  }

  if (filter === "week") {
    const dow = (local.weekday + 6) % 7;
    const weekStart = new Date(todayStart.getTime() - dow * 24 * 60 * 60 * 1000);
    return { start: weekStart.toISOString(), end: now.toISOString() };
  }

  if (filter === "month") {
    const monthStart = zonedDate(local.year, local.month, 1, timeZone);
    return { start: monthStart.toISOString(), end: now.toISOString() };
  }

  return { start: todayStart.toISOString(), end: now.toISOString() };
}

function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayMap[map.weekday] ?? 1,
  };
}

function zonedDate(year: number, month: number, day: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = fmt.formatToParts(guess);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  const offset = asUtc - guess.getTime();
  return new Date(guess.getTime() - offset);
}

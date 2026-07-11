export type TimeZoneOption = {
  id: string;
  label: string;
  offsetMinutes: number;
};

// Fixed curated list. Do not replace with runtime/system full timezone lists.
export const CURATED_IANA_TIME_ZONES: readonly string[] = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Halifax",
  "America/Sao_Paulo",
  "Atlantic/Azores",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Athens",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Sydney",
  "Pacific/Auckland",
] as const;

function getTimeZoneNamePart(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
}

function parseOffsetMinutes(offsetLabel: string): number {
  if (offsetLabel === "GMT" || offsetLabel === "UTC") {
    return 0;
  }

  const match = offsetLabel.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const minutes = parseInt(match[3] || "0", 10);

  return sign * (hours * 60 + minutes);
}

export function getTimeZoneOffsetMinutes(timeZone: string, date: Date = new Date()): number {
  return parseOffsetMinutes(getTimeZoneNamePart(date, timeZone));
}

function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

function toFriendlyZoneName(timeZone: string): string {
  if (timeZone === "UTC") {
    return "UTC";
  }

  const [region, city] = timeZone.split("/");
  const prettyCity = (city || timeZone).replace(/_/g, " ");
  return `${prettyCity} (${region})`;
}

export function getCuratedTimeZoneOptions(date: Date = new Date()): TimeZoneOption[] {
  return CURATED_IANA_TIME_ZONES
    .map((id) => {
      const offsetMinutes = getTimeZoneOffsetMinutes(id, date);
      return {
        id,
        offsetMinutes,
        label: `${formatUtcOffset(offsetMinutes)} - ${toFriendlyZoneName(id)}`,
      };
    })
    .sort((a, b) => {
      if (a.offsetMinutes !== b.offsetMinutes) {
        return a.offsetMinutes - b.offsetMinutes;
      }
      return a.label.localeCompare(b.label);
    });
}

function getDateTimePartsInTimeZone(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function zonedDateTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): number {
  // Iterative solve for DST-aware conversion.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  for (let i = 0; i < 3; i++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, new Date(utcMs));
    const nextUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - offsetMinutes * 60000;
    if (Math.abs(nextUtcMs - utcMs) < 1000) {
      utcMs = nextUtcMs;
      break;
    }
    utcMs = nextUtcMs;
  }

  return utcMs;
}

export function detectDefaultCuratedTimeZone(): string {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (local && CURATED_IANA_TIME_ZONES.includes(local)) {
    return local;
  }
  return "UTC";
}

export function convertTimeInTimeZoneToUtcTime(localTimeHHmm: string, timeZone: string): string {
  const [hour, minute] = localTimeHHmm.split(":").map((value) => parseInt(value, 10));
  const now = new Date();
  const localDateParts = getDateTimePartsInTimeZone(now, timeZone);
  const utcMs = zonedDateTimeToUtcMs(
    localDateParts.year,
    localDateParts.month,
    localDateParts.day,
    hour,
    minute,
    timeZone
  );
  const utcDate = new Date(utcMs);
  const hh = String(utcDate.getUTCHours()).padStart(2, "0");
  const mm = String(utcDate.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function convertUtcTimeToTimeZoneDisplay(utcTimeHHmm: string, timeZone: string): string {
  const [hour, minute] = utcTimeHHmm.split(":").map((value) => parseInt(value, 10));
  const now = new Date();
  const utcDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute, 0, 0));
  const parts = getDateTimePartsInTimeZone(utcDate, timeZone);
  const hh = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatUtcIsoForTimeZoneInput(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const parts = getDateTimePartsInTimeZone(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function parseTimeZoneInputToUtcIso(inputValue: string, timeZone: string): string {
  const [datePart, timePart] = inputValue.split("T");
  const [year, month, day] = datePart.split("-").map((value) => parseInt(value, 10));
  const [hour, minute] = timePart.split(":").map((value) => parseInt(value, 10));
  const utcMs = zonedDateTimeToUtcMs(year, month, day, hour, minute, timeZone);
  return new Date(utcMs).toISOString();
}

export function formatDateTimeInTimeZone(iso: string | null, timeZone: string): string {
  if (!iso) {
    return "Never";
  }

  return new Date(iso).toLocaleString(undefined, { timeZone });
}

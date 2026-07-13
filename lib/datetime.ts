type DateInput = string | Date | null | undefined;

type FormatDateTimeOptions = {
  timeZone?: string;
  fallback?: string;
  includeTimeZoneLabel?: boolean;
};

export function formatDateTimeForDisplay(
  value: DateInput,
  options: FormatDateTimeOptions = {}
): string {
  const { timeZone, fallback = "Never", includeTimeZoneLabel = false } = options;

  if (!value) {
    return fallback;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  const rendered = date.toLocaleString(undefined, timeZone ? { timeZone } : undefined);
  if (includeTimeZoneLabel && timeZone) {
    return `${rendered} (${timeZone})`;
  }

  return rendered;
}

export function formatDateForDisplay(
  value: DateInput,
  options: Omit<FormatDateTimeOptions, "includeTimeZoneLabel"> = {}
): string {
  const { timeZone, fallback = "Never" } = options;

  if (!value) {
    return fallback;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return date.toLocaleDateString(undefined, timeZone ? { timeZone } : undefined);
}

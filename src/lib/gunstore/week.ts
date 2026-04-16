export const BUSINESS_TIME_ZONE = "America/Toronto";

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const businessDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const businessWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: "short",
});

const businessOffsetFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIME_ZONE,
  timeZoneName: "shortOffset",
  hour: "2-digit",
});

function hasExplicitTimezone(value: string) {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function isDateOnlyString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function getFormatterParts(
  formatter: Intl.DateTimeFormat,
  value: string | Date
) {
  return formatter.formatToParts(parseGunstoreDate(value));
}

function getDatePart(
  formatter: Intl.DateTimeFormat,
  value: string | Date,
  type: Intl.DateTimeFormatPartTypes
) {
  return (
    getFormatterParts(formatter, value).find((part) => part.type === type)?.value ?? ""
  );
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const nextYear = `${next.getUTCFullYear()}`;
  const nextMonth = `${next.getUTCMonth() + 1}`.padStart(2, "0");
  const nextDay = `${next.getUTCDate()}`.padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getBusinessOffsetMinutes(date: Date) {
  const offsetLabel =
    businessOffsetFormatter
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const match = offsetLabel.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);

  if (!match) {
    return 0;
  }

  const [, sign, hours, minutes = "0"] = match;
  const totalMinutes = Number(hours) * 60 + Number(minutes);
  return sign === "-" ? -totalMinutes : totalMinutes;
}

export function parseGunstoreDate(value: string | Date) {
  if (value instanceof Date) {
    return new Date(value);
  }

  if (isDateOnlyString(value)) {
    return new Date(`${value}T00:00:00Z`);
  }

  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  const safeValue = hasExplicitTimezone(normalized) ? normalized : `${normalized}Z`;
  return new Date(safeValue);
}

export function getWeekRange(anchor: Date) {
  const base = parseGunstoreDate(anchor);
  const baseKey = getBusinessDateKey(base);
  const weekday = businessWeekdayFormatter.format(base);
  const diffToMonday =
    weekday === "Sun"
      ? -6
      : weekday === "Mon"
      ? 0
      : weekday === "Tue"
      ? -1
      : weekday === "Wed"
      ? -2
      : weekday === "Thu"
      ? -3
      : weekday === "Fri"
      ? -4
      : -5;

  const start = addDaysToDateKey(baseKey, diffToMonday);
  const end = addDaysToDateKey(start, 6);

  return { start, end };
}

export function isWithinWeek(dateString: string, weekAnchor: Date) {
  const { start, end } = getWeekRange(weekAnchor);
  const dateKey = getBusinessDateKey(dateString);
  return dateKey >= start && dateKey <= end;
}

export function getBusinessDateKey(value: string | Date) {
  if (typeof value === "string" && isDateOnlyString(value)) {
    return value;
  }

  const year = getDatePart(businessDateFormatter, value, "year");
  const month = getDatePart(businessDateFormatter, value, "month");
  const day = getDatePart(businessDateFormatter, value, "day");
  return `${year}-${month}-${day}`;
}

export function formatBusinessDate(value: string | Date) {
  return getBusinessDateKey(value);
}

export function formatBusinessDateTime(value: string | Date) {
  if (typeof value === "string" && isDateOnlyString(value)) {
    return `${value} 00:00`;
  }

  const year = getDatePart(businessDateTimeFormatter, value, "year");
  const month = getDatePart(businessDateTimeFormatter, value, "month");
  const day = getDatePart(businessDateTimeFormatter, value, "day");
  const hour = getDatePart(businessDateTimeFormatter, value, "hour");
  const minute = getDatePart(businessDateTimeFormatter, value, "minute");
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export function toBusinessDateTimeLocalValue(value: string | Date) {
  if (typeof value === "string" && isDateOnlyString(value)) {
    return `${value}T00:00`;
  }

  const year = getDatePart(businessDateTimeFormatter, value, "year");
  const month = getDatePart(businessDateTimeFormatter, value, "month");
  const day = getDatePart(businessDateTimeFormatter, value, "day");
  const hour = getDatePart(businessDateTimeFormatter, value, "hour");
  const minute = getDatePart(businessDateTimeFormatter, value, "minute");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export function businessLocalDateTimeToIso(value: string) {
  const [datePart, timePart = "00:00"] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);

  const initialGuess = Date.UTC(year, month - 1, day, hour, minute);
  const initialOffset = getBusinessOffsetMinutes(new Date(initialGuess));
  const adjustedGuess = initialGuess - initialOffset * 60_000;
  const finalOffset = getBusinessOffsetMinutes(new Date(adjustedGuess));
  return new Date(initialGuess - finalOffset * 60_000).toISOString();
}

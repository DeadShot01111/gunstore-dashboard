function hasExplicitTimezone(value: string) {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

export function parseGunstoreDate(value: string | Date) {
  if (value instanceof Date) {
    return new Date(value);
  }

  const normalized = value.includes(" ") ? value.replace(" ", "T") : value;
  const safeValue = hasExplicitTimezone(normalized) ? normalized : `${normalized}Z`;
  return new Date(safeValue);
}

export function getWeekRange(anchor: Date) {
  const base = parseGunstoreDate(anchor);
  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(base);
  start.setDate(base.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function isWithinWeek(dateString: string, weekAnchor: Date) {
  const date = parseGunstoreDate(dateString);
  const { start, end } = getWeekRange(weekAnchor);
  return date >= start && date <= end;
}

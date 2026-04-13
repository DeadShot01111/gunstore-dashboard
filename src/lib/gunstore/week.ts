export function getWeekRange(anchor: Date) {
  const base = new Date(anchor);
  const day = base.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(base);
  start.setDate(base.getDate() + diffToMonday);
  start.setHours(0, 1, 0, 0);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

export function isWithinWeek(dateString: string, weekAnchor: Date) {
  const date = new Date(dateString);
  const { start, end } = getWeekRange(weekAnchor);
  return date >= start && date <= end;
}
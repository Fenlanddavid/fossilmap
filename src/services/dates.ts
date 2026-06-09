export function formatDisplayDate(value: string | null | undefined, fallback = "Date not recorded") {
  if (!value) return fallback;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

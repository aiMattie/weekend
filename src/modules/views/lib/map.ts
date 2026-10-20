/** Location column value (`{ lat, lng, address }`) -> a plottable point, null when invalid or empty. */
export function locationOf(value: unknown): { lat: number; lng: number; address: string } | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const lat = Number(v.lat);
  const lng = Number(v.lng ?? v.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, address: typeof v.address === "string" ? v.address : "" };
}

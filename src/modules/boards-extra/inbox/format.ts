/** Relative time in the user's language via i18n keys (inbox.ago.*). */
export function relTime(iso: string, t: (k: string, v?: Record<string, string | number>) => string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return t("inbox.ago.now");
  if (s < 3600) return t("inbox.ago.min", { n: Math.floor(s / 60) });
  if (s < 86400) return t("inbox.ago.hour", { n: Math.floor(s / 3600) });
  if (s < 7 * 86400) return t("inbox.ago.day", { n: Math.floor(s / 86400) });
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

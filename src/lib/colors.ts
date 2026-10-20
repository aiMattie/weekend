/** Color palette (used for groups and status/dropdown labels). */
export const WEEKEND_COLORS: { name: string; hex: string }[] = [
  { name: "done-green", hex: "#00c875" },
  { name: "grass-green", hex: "#037f4c" },
  { name: "saladish", hex: "#cab641" },
  { name: "egg-yolk", hex: "#ffcb00" },
  { name: "working_orange", hex: "#fdab3d" },
  { name: "dark-orange", hex: "#ff642e" },
  { name: "peach", hex: "#ffadad" },
  { name: "sunset", hex: "#ff7575" },
  { name: "stuck-red", hex: "#df2f4a" },
  { name: "dark-red", hex: "#bb3354" },
  { name: "sofia_pink", hex: "#ff158a" },
  { name: "lipstick", hex: "#ff5ac4" },
  { name: "bubble", hex: "#faa1f1" },
  { name: "purple", hex: "#a25ddc" },
  { name: "dark_purple", hex: "#784bd1" },
  { name: "berry", hex: "#7e3b8a" },
  { name: "indigo", hex: "#5559df" },
  { name: "navy", hex: "#225091" },
  { name: "bright-blue", hex: "#0073ea" },
  { name: "river", hex: "#579bfc" },
  { name: "sky", hex: "#66ccff" },
  { name: "royal", hex: "#0086c0" },
  { name: "american_gray", hex: "#757575" },
  { name: "blackish", hex: "#333333" },
  { name: "explosive", hex: "#c4c4c4" },
];

/** Readable text color (white or dark) for a label background. */
export function contrastText(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.8 ? "#323338" : "#ffffff";
}

/** Initials + deterministic avatar color for users without a photo. */
export function avatarColor(seed: string): string {
  const palette = ["#579bfc", "#a25ddc", "#00c875", "#fdab3d", "#ff158a", "#0086c0", "#7e3b8a", "#037f4c"];
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}
export const initials = (name: string): string =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

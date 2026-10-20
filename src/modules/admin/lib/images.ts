/** Small image store for avatars and the account logo (data/uploads/admin/...). Validates type by magic bytes. */
import { mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ValidationError } from "../../../lib/errors";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TYPES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/gif", ext: "gif", test: (b) => b.subarray(0, 4).toString("latin1") === "GIF8" },
  { mime: "image/webp", ext: "webp", test: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];

const root = () => path.join(process.cwd(), "data", "uploads", "admin");

export function detectImage(buf: Buffer): { mime: string; ext: string } {
  if (buf.length === 0) throw new ValidationError("Empty file");
  if (buf.length > MAX_IMAGE_BYTES) throw new ValidationError("Image is larger than 2 MB");
  const t = TYPES.find((x) => x.test(buf));
  if (!t) throw new ValidationError("Only PNG, JPEG, GIF or WebP images are allowed");
  return t;
}

/** Store `<kind>-<id>.<ext>` and remove older files of the same owner. Returns the file name. */
export function saveImage(kind: "avatar" | "logo", id: string, buf: Buffer): string {
  const t = detectImage(buf);
  mkdirSync(root(), { recursive: true });
  removeImage(kind, id);
  const name = `${kind}-${id}.${t.ext}`;
  writeFileSync(path.join(root(), name), buf);
  return name;
}

export function removeImage(kind: "avatar" | "logo", id: string): void {
  for (const t of TYPES) {
    const f = path.join(root(), `${kind}-${id}.${t.ext}`);
    if (existsSync(f)) rmSync(f);
  }
}

export function readImage(kind: "avatar" | "logo", id: string): { data: Buffer; mime: string } | null {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  for (const t of TYPES) {
    const f = path.join(root(), `${kind}-${id}.${t.ext}`);
    if (existsSync(f)) return { data: readFileSync(f), mime: t.mime };
  }
  return null;
}

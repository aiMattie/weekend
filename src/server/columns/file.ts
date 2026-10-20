import { ValidationError } from "../../lib/errors";
import { OP_IS_EMPTY, OP_NOT_EMPTY, NUMBER_OPS, testNumber, testText } from "./ops";
import type { ColumnLogic } from "./types";
import { isObj } from "./util";

/**
 * file: `{ files: [{ assetId, name, isImage?, size?, mimeType?, fileType: "ASSET" }] }` (API shape).
 * Link files (Google Drive/Dropbox style): `{ name, linkToFile, fileType: "LINK" }`.
 * Uploads go through POST /api/v1/assets (assets service), which stores the bytes in data/files.
 */
export interface FileEntry {
  assetId?: string;
  name: string;
  isImage?: boolean;
  size?: number;
  mimeType?: string;
  fileType: "ASSET" | "LINK";
  linkToFile?: string;
}
export type FileValue = { files: FileEntry[] };

export const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
export const fileUrl = (e: FileEntry): string => (e.fileType === "LINK" ? e.linkToFile ?? "#" : `/api/v1/assets/${e.assetId}`);

function entry(e: unknown): FileEntry {
  if (!isObj(e)) throw new ValidationError(`Invalid file entry: ${JSON.stringify(e)}`);
  const name = String(e.name ?? "").trim();
  const link = typeof e.linkToFile === "string" ? e.linkToFile : typeof e.url === "string" ? e.url : undefined;
  if (e.assetId !== undefined && e.assetId !== null && e.assetId !== "") {
    const assetId = String(e.assetId);
    if (!/^\d+$/.test(assetId)) throw new ValidationError(`Invalid assetId: ${assetId}`);
    const out: FileEntry = { assetId, name: name || `file-${assetId}`, fileType: "ASSET" };
    out.isImage = e.isImage === true || e.isImage === "true" || IMAGE_RE.test(out.name) || (typeof e.mimeType === "string" && e.mimeType.startsWith("image/"));
    if (typeof e.size === "number") out.size = e.size;
    if (typeof e.mimeType === "string") out.mimeType = e.mimeType;
    return out;
  }
  if (link) {
    if (!/^https?:\/\//i.test(link)) throw new ValidationError("File link must start with http(s)://");
    return { name: name || link, fileType: "LINK", linkToFile: link };
  }
  throw new ValidationError("File entry needs an assetId or linkToFile");
}

export const fileColumn: ColumnLogic<FileValue> = {
  type: "file",
  label: "Files",
  category: "files",
  icon: "File",
  defaultSettings: () => ({}),
  validate(input) {
    if (input === null || input === undefined) return null;
    const list = Array.isArray(input) ? input : isObj(input) && Array.isArray(input.files) ? input.files : null;
    if (!list) throw new ValidationError("File value must be { files: [{ assetId, name }] }");
    const files = list.map(entry);
    return files.length ? { files } : null;
  },
  serialize: (v) => v,
  format: (v) => (v?.files ?? []).map((f) => f.name).join(", "),
  filter: {
    operators: [{ id: "contains", label: "Contains file name", needsOperand: true }, ...NUMBER_OPS.filter((o) => ["eq", "gt", "lt"].includes(o.id)), OP_IS_EMPTY, OP_NOT_EMPTY],
    test(v, op, operand) {
      if (op === "contains") return testText((v?.files ?? []).map((f) => f.name).join(" "), "contains", operand);
      if (op === "is_empty") return !v?.files.length;
      if (op === "is_not_empty") return !!v?.files.length;
      return testNumber(v?.files.length ?? 0, op, operand);
    },
  },
  sortKey: (v) => v?.files.length ?? null,
  summarize(vals) {
    const n = vals.reduce((a, v) => a + (v?.files.length ?? 0), 0);
    return n ? { text: String(n) } : null;
  },
};

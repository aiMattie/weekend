/** Client helpers for the assets REST API (/api/v1/assets, built by the columns module). */
export interface AssetDto {
  id: string;
  boardId: string | null;
  itemId: string | null;
  updateId: string | null;
  columnId: string | null;
  name: string;
  mimeType: string | null;
  size: number;
  url: string;
  isImage: boolean;
  createdAt: string;
  uploadedBy?: string | null;
}

export const MAX_UPLOAD_MB = 50;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function uploadAsset(file: File, target: { boardId: string; itemId: string; updateId?: string }): Promise<AssetDto> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new Error(`${file.name}: > ${MAX_UPLOAD_MB} MB`);
  const fd = new FormData();
  fd.append("file", file, file.name);
  fd.append("boardId", target.boardId);
  fd.append("itemId", target.itemId);
  if (target.updateId) fd.append("updateId", target.updateId);
  const res = await fetch("/api/v1/assets", { method: "POST", body: fd, credentials: "same-origin" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? res.statusText);
  return json as AssetDto;
}

/** Image files from a clipboard/drop event. */
export const filesFrom = (list: FileList | DataTransferItemList | null | undefined): File[] => {
  if (!list) return [];
  const out: File[] = [];
  for (let i = 0; i < list.length; i++) {
    const it = list[i] as File | DataTransferItem;
    if (it instanceof File) out.push(it);
    else if (it.kind === "file") { const f = it.getAsFile(); if (f) out.push(f); }
  }
  return out;
};

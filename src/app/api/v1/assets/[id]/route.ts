import { api } from "@/server/http";
import { assets } from "@/server/services";

type P = { id: string };
/** Only these types are shown inline; everything else downloads (no script/html from uploads). */
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|application\/pdf|video\/(mp4|webm)|audio\/(mpeg|ogg|wav|webm)|text\/plain)$/;

export const GET = api<P>(({ actor, params, query }) => {
  const { asset, bytes } = assets.read(actor, params.id);
  const type = asset.mimeType ?? "application/octet-stream";
  const inline = query.get("download") !== "1" && INLINE.test(type);
  return new Response(new Uint8Array(bytes()), {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(asset.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
});
export const DELETE = api<P>(({ actor, params }) => assets.remove(actor, params.id));

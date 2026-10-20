import { subscribeToBoard } from "@/lib/events";
import { getActor } from "@/lib/auth";
import { requireBoard } from "@/server/services/_shared";
import { errorResponse } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events for one board. Each message is `data: <AppEvent JSON>`.
 * The client (useBoardEvents) debounces and refetches /api/v1/boards/:id/full.
 */
export async function GET(req: Request, { params }: { params: Promise<{ boardId: string }> }) {
  try {
    const actor = await getActor(req);
    const { boardId } = await params;
    requireBoard(actor, boardId, "board:view");
    const encoder = new TextEncoder();
    let cleanup: (() => void) | null = null;
    const stream = new ReadableStream({
      start(controller) {
        const send = (chunk: string) => {
          try { controller.enqueue(encoder.encode(chunk)); } catch { cleanup?.(); }
        };
        send(`retry: 2000\n\n: connected\n\n`);
        const off = subscribeToBoard(boardId, (e) => send(`data: ${JSON.stringify(e)}\n\n`));
        const ping = setInterval(() => send(`: ping\n\n`), 20_000);
        cleanup = () => { off(); clearInterval(ping); try { controller.close(); } catch { /* closed */ } };
        req.signal.addEventListener("abort", () => cleanup?.());
      },
      cancel() { cleanup?.(); },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
  } catch (err) {
    return errorResponse(err);
  }
}

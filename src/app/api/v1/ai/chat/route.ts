/** Sidekick chat as Server-Sent Events: conversation, text deltas, tool status, pending action cards, done. */
import { api } from "@/server/http";
import { ai } from "@/server/services";

export const dynamic = "force-dynamic";

export const POST = api(async ({ actor, body, req }) => {
  const input = await body();
  ai.preflight(actor); // not configured / out of credits: a normal JSON error before the stream opens
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ai.ChatEvent) => { try { controller.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)); } catch { /* client went away */ } };
      try { await ai.chat(actor, input, send); }
      catch (err) { send({ type: "error", message: err instanceof Error ? err.message : "Fout" }); send({ type: "done", credits: 0 }); }
      try { controller.close(); } catch { /* already closed */ }
    },
    cancel() { void req; },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
});

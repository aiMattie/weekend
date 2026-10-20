import { api } from "@/server/http";
import * as undo from "@/server/services/undo";

type P = { id: string };
/** { canUndo, canRedo, undoLabel, redoLabel } */
export const GET = api<P>(({ actor, params }) => undo.state(actor, params.id));
/** body: { action: "record", label, undo: UndoOp[], redo: UndoOp[] } | { action: "undo" } | { action: "redo" } | { action: "clear" } */
export const POST = api<P>(async ({ actor, params, body }) => {
  const b = await body();
  switch (b.action) {
    case "undo": return { result: undo.undo(actor, params.id), state: undo.state(actor, params.id) };
    case "redo": return { result: undo.redo(actor, params.id), state: undo.state(actor, params.id) };
    case "clear": undo.clear(actor, params.id); return undo.state(actor, params.id);
    default: undo.record(actor, params.id, b); return undo.state(actor, params.id);
  }
});

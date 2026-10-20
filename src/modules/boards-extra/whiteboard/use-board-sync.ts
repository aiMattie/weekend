"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { diffElements, mergeRemote, toBase, type El } from "./model";

export type SyncState = "saved" | "dirty" | "saving" | "error";

interface Remote { version: number; data: { elements: El[] } }

interface Mem {
  base: Map<string, string>; version: number; inflight: boolean; again: boolean; timer: ReturnType<typeof setTimeout> | null; opts: Opts;
  save: () => Promise<void>; schedule: (ms?: number) => void;
}

interface Opts {
  id: string;
  initial: { version: number; elements: El[] };
  getElements: () => El[];
  setElements: (e: El[]) => void;
  busy: () => boolean;
  onRemote: () => void;
}

/**
 * Debounced patch-saving + version polling for one whiteboard. Local edits always win for the elements
 * they touched; everything else follows the server (see mergeRemote).
 */
export function useBoardSync(opts: Opts) {
  const [state, setState] = useState<SyncState>("saved");
  const memRef = useRef<Mem | null>(null);
  /* eslint-disable react-hooks/refs -- lazy ref initialisation (documented React pattern) */
  if (memRef.current === null) {
    memRef.current = {
      base: toBase(opts.initial.elements), version: opts.initial.version, inflight: false, again: false, timer: null, opts,
      save: async () => {}, schedule: () => {},
    };
  }
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    const mem = memRef.current!;
    mem.opts = opts;
    const applyRemote = (r: Remote) => {
      const m = mergeRemote(mem.opts.getElements(), mem.base, r.data.elements);
      mem.base = m.base;
      mem.version = r.version;
      mem.opts.setElements(m.elements);
    };
    mem.schedule = (ms = 500) => {
      setState((s) => (s === "saving" ? s : "dirty"));
      if (mem.timer) clearTimeout(mem.timer);
      mem.timer = setTimeout(() => void mem.save(), ms);
    };
    mem.save = async () => {
      if (mem.inflight) { mem.again = true; return; }
      const { upsert, remove } = diffElements(mem.base, mem.opts.getElements());
      if (!upsert.length && !remove.length) { setState("saved"); return; }
      mem.inflight = true;
      setState("saving");
      try {
        const r = await fetch(`/api/v1/whiteboards/${mem.opts.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ patch: { upsert, remove } }), keepalive: true });
        if (!r.ok) throw new Error(String(r.status));
        applyRemote((await r.json()) as Remote);
        const left = diffElements(mem.base, mem.opts.getElements());
        setState(left.upsert.length || left.remove.length ? "dirty" : "saved");
      } catch {
        setState("error");
        mem.again = true;
      } finally {
        mem.inflight = false;
        if (mem.again) { mem.again = false; mem.schedule(2000); }
      }
    };
  });

  // poll the cheap version endpoint; fetch everything only when it moved
  useEffect(() => {
    const mem = memRef.current!;
    const iv = setInterval(async () => {
      if (mem.inflight || mem.opts.busy() || document.hidden) return;
      try {
        const v = await fetch(`/api/v1/whiteboards/${mem.opts.id}/version`);
        if (!v.ok || (await v.json()).version === mem.version) return;
        const full = await fetch(`/api/v1/whiteboards/${mem.opts.id}`);
        if (!full.ok || mem.opts.busy()) return;
        const data = (await full.json()) as Remote;
        if (data.version === mem.version) return;
        const m = mergeRemote(mem.opts.getElements(), mem.base, data.data.elements);
        mem.base = m.base;
        mem.version = data.version;
        mem.opts.setElements(m.elements);
        mem.opts.onRemote();
      } catch { /* offline: try again next tick */ }
    }, 3000);
    return () => clearInterval(iv);
  }, []);

  // flush on leave
  useEffect(() => {
    const mem = memRef.current!;
    const flush = () => { if (mem.timer) clearTimeout(mem.timer); void mem.save(); };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, []);

  const schedule = useCallback((ms?: number) => memRef.current!.schedule(ms), []);
  return { state, schedule };
}

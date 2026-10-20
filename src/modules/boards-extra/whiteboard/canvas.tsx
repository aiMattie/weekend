"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsClient, usePersistentState } from "@/lib/use-persistent-state";
import { useT } from "@/lib/i18n/client";
import { renderBody } from "./elements";
import { MIN_SIZE, NOTE_COLORS, SIZES, boundsOf, newElementId, screenToWorld, translate, zoomAt, type El, type View } from "./model";
import { Toolbar, type Tool } from "./toolbar";
import { useBoardSync } from "./use-board-sync";
import styles from "./whiteboard.module.css";

export interface CanvasProps {
  id: string;
  name: string;
  workspace: { id: string; name: string };
  version: number;
  elements: El[];
  canEdit: boolean;
}

type Drag =
  | { kind: "pan"; sx: number; sy: number; view: View }
  | { kind: "move"; wx: number; wy: number; orig: Map<string, El>; before: El[] }
  | { kind: "resize"; id: string; wx: number; wy: number; orig: El; before: El[] }
  | { kind: "pen"; id: string; before: El[] }
  | { kind: "connect"; from: string; wx: number; wy: number };

const TEXT_TYPES = new Set(["note", "rect", "ellipse", "diamond", "text"]);
const HISTORY_MAX = 60;
const DEFAULT_VIEW: View = { x: 120, y: 80, zoom: 1 };

export function WhiteboardCanvas(p: CanvasProps) {
  const t = useT();
  const hydrated = useIsClient();
  const [elements, setElementsState] = useState<El[]>(p.elements);
  const elRef = useRef(p.elements);
  const [storedView, setStoredView] = usePersistentState(`wb-view-${p.id}`, "");
  const view = useMemo<View>(() => { try { return storedView ? (JSON.parse(storedView) as View) : DEFAULT_VIEW; } catch { return DEFAULT_VIEW; } }, [storedView]);
  const viewRef = useRef(view);
  useEffect(() => { viewRef.current = view; }, [view]);
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState(NOTE_COLORS[0]);
  const [editing, setEditing] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [preview, setPreview] = useState<[number, number, number, number] | null>(null);
  const [banner, setBanner] = useState(false);
  const [name, setName] = useState(p.name);
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const history = useRef<El[][]>([]);
  const space = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const editBefore = useRef<El[] | null>(null);

  const setEls = useCallback((next: El[]) => { elRef.current = next; setElementsState(next); }, []);
  const setViewBoth = useCallback((v: View) => { viewRef.current = v; setStoredView(JSON.stringify(v)); }, [setStoredView]);
  const sync = useBoardSync({
    id: p.id, initial: { version: p.version, elements: p.elements }, getElements: () => elRef.current, setElements: setEls,
    busy: () => drag.current !== null || editBefore.current !== null,
    onRemote: () => { setBanner(true); setTimeout(() => setBanner(false), 2500); },
  });
  const { schedule } = sync;

  const [canUndo, setCanUndo] = useState(false);
  const pushHistory = (before: El[]) => {
    if (before === elRef.current) return;
    history.current = [...history.current.slice(-(HISTORY_MAX - 1)), before];
    setCanUndo(true);
  };
  const commit = (next: El[]) => { pushHistory(elRef.current); setEls(next); schedule(); };
  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    setCanUndo(history.current.length > 0);
    setEls(prev);
    setSelection((s) => s.filter((id) => prev.some((e) => e.id === id)));
    schedule();
  };

  const all = useMemo(() => new Map(elements.map((e) => [e.id, e])), [elements]);

  const worldOf = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect();
    return screenToWorld(viewRef.current, e.clientX - r.left, e.clientY - r.top);
  };
  const hitId = (target: EventTarget | null): string | null => (target as Element | null)?.closest?.("[data-el-id]")?.getAttribute("data-el-id") ?? null;
  const hitAt = (x: number, y: number): string | null => {
    for (const node of document.elementsFromPoint(x, y)) {
      const id = node.closest("[data-el-id]")?.getAttribute("data-el-id");
      if (id) return id;
    }
    return null;
  };

  /* ---------------------------------------------------------------- creating */
  const add = (el: El, edit = false) => {
    commit([...elRef.current, el]);
    setSelection([el.id]);
    setTool("select");
    if (edit) { editBefore.current = elRef.current; setEditing(el.id); }
  };
  const place = (type: "note" | "rect" | "ellipse" | "diamond" | "text", wx: number, wy: number) => {
    const s = SIZES[type];
    add({ id: newElementId(), type, x: Math.round(wx - s.w / 2), y: Math.round(wy - s.h / 2), w: s.w, h: s.h, text: "", color: type === "text" ? undefined : color }, true);
  };
  const addImage = (src: string) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 360 / Math.max(img.width, 1));
      const [cx, cy] = screenToWorld(viewRef.current, (svgRef.current?.clientWidth ?? 800) / 2, (svgRef.current?.clientHeight ?? 600) / 2);
      const w = Math.round(img.width * k) || SIZES.image.w;
      const h = Math.round(img.height * k) || SIZES.image.h;
      add({ id: newElementId(), type: "image", x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w, h, src });
    };
    img.onerror = () => add({ id: newElementId(), type: "image", x: 0, y: 0, ...SIZES.image, src });
    img.src = src;
  };
  const pickImage = () => {
    const url = window.prompt(t("docs.wb.imageUrl"), "");
    if (url === null) return;
    if (url.trim()) addImage(url.trim());
    else fileInput.current?.click();
  };
  const onFile = (f: File) => {
    const fr = new FileReader();
    fr.onload = () => {
      const src = String(fr.result);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 1000 / img.width);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        addImage(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => addImage(src);
      img.src = src;
    };
    fr.readAsDataURL(f);
  };

  const removeSelected = () => {
    if (!selection.length) return;
    const gone = new Set(selection);
    commit(elRef.current.filter((e) => !gone.has(e.id) && !(e.type === "connector" && ((e.from && gone.has(e.from)) || (e.to && gone.has(e.to))))));
    setSelection([]);
  };
  const duplicateSelected = () => {
    const ids = new Set(selection);
    const idMap = new Map<string, string>();
    const copies: El[] = [];
    for (const e of elRef.current) if (ids.has(e.id) && e.type !== "connector") { const n = newElementId(); idMap.set(e.id, n); copies.push({ ...translate(e, 24, 24), id: n }); }
    for (const e of elRef.current) if (ids.has(e.id) && e.type === "connector" && e.from && e.to && idMap.has(e.from) && idMap.has(e.to)) copies.push({ ...e, id: newElementId(), from: idMap.get(e.from), to: idMap.get(e.to) });
    if (!copies.length) return;
    commit([...elRef.current, ...copies]);
    setSelection(copies.map((c) => c.id));
  };
  const recolor = (c: string) => {
    setColor(c);
    if (!selection.length) return;
    const ids = new Set(selection);
    commit(elRef.current.map((e) => (ids.has(e.id) && e.type !== "connector" && e.type !== "image" ? { ...e, color: c } : e)));
  };

  /* ---------------------------------------------------------------- pointer */
  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) return;
    e.preventDefault(); // no compat mousedown: it would blur the text editor we may open below
    const svg = svgRef.current!;
    svg.setPointerCapture(e.pointerId);
    const [wx, wy] = worldOf(e);
    const hit = hitId(e.target);
    if (e.button === 1 || space.current || !p.canEdit) { drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view: viewRef.current }; setPanning(true); return; }
    if (tool === "select") {
      const handle = (e.target as Element).getAttribute?.("data-handle");
      if (handle && selection.length === 1) {
        const el = all.get(selection[0])!;
        drag.current = { kind: "resize", id: el.id, wx, wy, orig: el, before: elRef.current };
        return;
      }
      if (hit) {
        const sel = e.shiftKey ? (selection.includes(hit) ? selection.filter((s) => s !== hit) : [...selection, hit]) : selection.includes(hit) ? selection : [hit];
        setSelection(sel);
        drag.current = { kind: "move", wx, wy, orig: new Map(sel.map((id) => [id, all.get(id)!]).filter(([, v]) => !!v) as [string, El][]), before: elRef.current };
      } else {
        setSelection([]);
        drag.current = { kind: "pan", sx: e.clientX, sy: e.clientY, view: viewRef.current };
        setPanning(true);
      }
      return;
    }
    if (tool === "pen") {
      const el: El = { id: newElementId(), type: "pen", x: wx, y: wy, points: [[0, 0]], color: color === NOTE_COLORS[0] ? undefined : color };
      drag.current = { kind: "pen", id: el.id, before: elRef.current };
      elRef.current = [...elRef.current, el];
      setElementsState(elRef.current);
      return;
    }
    if (tool === "connector") {
      if (hit && all.get(hit)?.type !== "connector") { drag.current = { kind: "connect", from: hit, wx, wy }; setPreview([wx, wy, wx, wy]); }
      return;
    }
    if (tool !== "image") place(tool, wx, wy);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "pan") { setViewBoth({ ...d.view, x: d.view.x + e.clientX - d.sx, y: d.view.y + e.clientY - d.sy }); return; }
    const [wx, wy] = worldOf(e);
    if (d.kind === "move") {
      const dx = wx - d.wx;
      const dy = wy - d.wy;
      setEls(elRef.current.map((el) => {
        const o = d.orig.get(el.id);
        if (!o) return el;
        if (o.type === "connector") return o.from || o.to ? o : { ...o, points: o.points?.map((q) => [q[0] + dx, q[1] + dy]) };
        return translate(o, dx, dy);
      }));
    } else if (d.kind === "resize") {
      const b = boundsOf(d.orig);
      setEls(elRef.current.map((el) => (el.id === d.id ? { ...el, w: Math.max(MIN_SIZE, Math.round(b.w + wx - d.wx)), h: Math.max(MIN_SIZE, Math.round(b.h + wy - d.wy)) } : el)));
    } else if (d.kind === "pen") {
      setEls(elRef.current.map((el) => (el.id === d.id ? { ...el, points: [...(el.points ?? []), [Math.round(wx - el.x), Math.round(wy - el.y)]] } : el)));
    } else if (d.kind === "connect") {
      setPreview([d.wx, d.wy, wx, wy]);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    setPreview(null);
    if (!d) return;
    if (d.kind === "move" || d.kind === "resize") {
      if (d.before !== elRef.current) { pushHistory(d.before); schedule(); }
    } else if (d.kind === "pen") {
      const el = elRef.current.find((x) => x.id === d.id);
      if (el && (el.points?.length ?? 0) < 2) setEls(elRef.current.filter((x) => x.id !== d.id));
      else { pushHistory(d.before); schedule(); }
    } else if (d.kind === "connect") {
      const target = hitAt(e.clientX, e.clientY);
      const [wx, wy] = worldOf(e);
      if (target && target !== d.from && all.get(target)?.type !== "connector") add({ id: newElementId(), type: "connector", x: 0, y: 0, from: d.from, to: target });
      else if (!target) add({ id: newElementId(), type: "connector", x: 0, y: 0, from: d.from, points: [[d.wx, d.wy], [wx, wy]] });
      setTool("connector");
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const id = hitId(e.target);
    const el = id ? all.get(id) : undefined;
    if (!p.canEdit || !el || !TEXT_TYPES.has(el.type)) return;
    editBefore.current = elRef.current;
    setSelection([el.id]);
    setEditing(el.id);
  };

  const finishEdit = () => {
    const id = editing;
    setEditing(null);
    if (!id) return;
    const el = elRef.current.find((x) => x.id === id);
    const before = editBefore.current ?? elRef.current;
    editBefore.current = null;
    if (el?.type === "text" && !el.text?.trim()) { pushHistory(before); setEls(elRef.current.filter((x) => x.id !== id)); setSelection([]); schedule(); return; }
    if (before !== elRef.current) pushHistory(before);
    schedule();
  };

  /* ---------------------------------------------------------------- wheel + keyboard */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) setViewBoth(zoomAt(viewRef.current, Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top));
      else setViewBoth({ ...viewRef.current, x: viewRef.current.x - e.deltaX, y: viewRef.current.y - e.deltaY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setViewBoth]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => ["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement | null)?.tagName ?? "");
    const down = (e: KeyboardEvent) => {
      if (typing(e) || editing) return;
      if (e.code === "Space") { space.current = true; e.preventDefault(); return; }
      if (!p.canEdit) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); duplicateSelected(); }
      else if (e.key === "Escape") { setSelection([]); setTool("select"); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") space.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }); // handlers close over the latest selection/editing state

  const zoomBy = (f: number) => { const r = stageRef.current!.getBoundingClientRect(); setViewBoth(zoomAt(viewRef.current, f, r.width / 2, r.height / 2)); };

  const rename = async (v: string) => {
    const n = v.trim();
    if (!n || n === p.name) return;
    await fetch(`/api/v1/whiteboards/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n }) });
  };

  const ordered = useMemo(() => [...elements.filter((e) => e.type === "connector"), ...elements.filter((e) => e.type !== "connector")], [elements]);
  const single = selection.length === 1 ? all.get(selection[0]) : undefined;
  const editEl = editing ? all.get(editing) : undefined;
  const editRect = editEl ? boundsOf(editEl) : null;
  const stateLabel = { saved: t("docs.wb.saved"), dirty: "...", saving: t("docs.wb.saving"), error: t("docs.wb.error") }[sync.state];

  return (
    <div className={styles.root} data-testid="whiteboard-page" data-wb-id={p.id} data-hydrated={String(hydrated)}>
      <div className={styles.header}>
        <nav className={styles.crumbs}>
          <Link href="/whiteboards">{t("docs.wb.title")}</Link><span>/</span>
          <Link href={`/workspaces/${p.workspace.id}`}>{p.workspace.name}</Link>
        </nav>
        <input className={styles.nameInput} value={name} readOnly={!p.canEdit} aria-label={t("docs.wb.name")} data-testid="wb-name" onChange={(e) => setName(e.target.value)} onBlur={(e) => void rename(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <span className={styles.spacer} />
        <span className={`${styles.state} ${sync.state === "error" ? styles.stateErr : ""}`} data-testid="wb-save-state" data-state={sync.state}>{p.canEdit ? stateLabel : t("docs.wb.readOnly")}</span>
      </div>
      <div ref={stageRef} className={styles.stage} style={{ backgroundSize: `${24 * view.zoom}px ${24 * view.zoom}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>
        <svg
          ref={svgRef} className={`${styles.svg} ${panning ? styles.panning : ""}`} data-testid="wb-canvas" data-tool={tool} data-zoom={view.zoom.toFixed(2)}
          style={{ cursor: tool === "select" ? "default" : "crosshair" }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onDoubleClick={onDoubleClick}
        >
          <defs>
            <marker id="wb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#323338" /></marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {ordered.map((el) => (
              <g key={el.id} data-el-id={el.id} data-testid="wb-element" data-type={el.type} data-text={el.text ?? ""} style={{ pointerEvents: tool === "select" || tool === "connector" ? "auto" : "none", cursor: tool === "select" && p.canEdit ? "move" : undefined }}>
                {renderBody(el, all)}
              </g>
            ))}
            {selection.map((id) => {
              const el = all.get(id);
              if (!el) return null;
              const b = boundsOf(el, all);
              return <rect key={`sel-${id}`} x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} fill="none" stroke="#0073ea" strokeWidth={1.5 / view.zoom} strokeDasharray="6 4" pointerEvents="none" data-testid="wb-selection" />;
            })}
            {single && p.canEdit && single.type !== "connector" && single.type !== "pen" && (() => {
              const b = boundsOf(single);
              const s = 10 / view.zoom;
              return <rect data-handle="se" x={b.x + b.w - s / 2 + 4} y={b.y + b.h - s / 2 + 4} width={s} height={s} fill="#fff" stroke="#0073ea" strokeWidth={1.5 / view.zoom} style={{ cursor: "nwse-resize" }} />;
            })()}
            {preview && <line x1={preview[0]} y1={preview[1]} x2={preview[2]} y2={preview[3]} stroke="#0073ea" strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />}
          </g>
        </svg>

        {p.canEdit && <Toolbar tool={tool} onTool={(x) => { if (x === "image") pickImage(); else setTool(x); }} color={color} onColor={recolor} hasSelection={selection.length > 0} canUndo={canUndo} onDelete={removeSelected} onDuplicate={duplicateSelected} onUndo={undo} />}
        <div className={styles.zoom}>
          <button type="button" className={styles.zoomBtn} onClick={() => zoomBy(1 / 1.25)} aria-label={t("docs.wb.zoomOut")} data-testid="wb-zoom-out">-</button>
          <button type="button" className={styles.zoomLabel} onClick={() => setViewBoth(DEFAULT_VIEW)} title={t("docs.wb.zoomReset")} data-testid="wb-zoom-label">{Math.round(view.zoom * 100)}%</button>
          <button type="button" className={styles.zoomBtn} onClick={() => zoomBy(1.25)} aria-label={t("docs.wb.zoomIn")} data-testid="wb-zoom-in">+</button>
        </div>
        <div className={styles.hint}>{t("docs.wb.hint")}</div>
        {banner && <div className={styles.banner} data-testid="wb-remote-banner">{t("docs.wb.updatedByOther")}</div>}
        {editEl && editRect && (
          <textarea
            autoFocus className={styles.editor} data-testid="wb-text-editor" value={editEl.text ?? ""} placeholder={t("docs.wb.placeholder")}
            style={{ left: editRect.x * view.zoom + view.x, top: editRect.y * view.zoom + view.y, width: Math.max(editRect.w * view.zoom, 120), height: Math.max(editRect.h * view.zoom, 60) }}
            onChange={(e) => setEls(elRef.current.map((x) => (x.id === editing ? { ...x, text: e.target.value } : x)))}
            onBlur={finishEdit}
            onKeyDown={(e) => { if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur(); }}
          />
        )}
        <input ref={fileInput} type="file" accept="image/*" hidden data-testid="wb-image-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      </div>
    </div>
  );
}


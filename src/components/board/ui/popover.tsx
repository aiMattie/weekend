"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./ui.module.css";

interface PopoverProps {
  /** element the popover is positioned next to */
  anchorEl: HTMLElement | null;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
  style?: CSSProperties;
  /** keep open when clicking the anchor (the anchor toggles it itself) */
  ignoreAnchor?: boolean;
}

/**
 * Lightweight portal popover: positions itself under `anchorEl`, flips above when there is no
 * room, closes on outside mousedown and Escape. Clicks inside do not bubble to React parents.
 */
export function Popover({ anchorEl, onClose, children, align = "start", className, style, ignoreAnchor = true }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchorEl || !ref.current) return;
    const place = () => {
      const a = anchorEl.getBoundingClientRect();
      const p = ref.current!.getBoundingClientRect();
      let left = align === "end" ? a.right - p.width : a.left;
      left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8));
      let top = a.bottom + 4;
      if (top + p.height > window.innerHeight - 8 && a.top - p.height - 4 > 8) top = a.top - p.height - 4;
      setPos({ top, left });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorEl, align]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (ignoreAnchor && anchorEl?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key, true);
    };
  }, [anchorEl, onClose, ignoreAnchor]);

  if (!anchorEl || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      className={`${styles.popover} ${className ?? ""}`}
      style={{ ...style, top: pos?.top ?? -9999, left: pos?.left ?? -9999, visibility: pos ? "visible" : "hidden" }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      role="dialog"
    >
      {children}
    </div>,
    document.body,
  );
}

/** Tiptap suggestion popup (DOM based, same look as the update composer's @mention list). */
export interface PopupItem { id: string; label: string; hint?: string }

export function popupRenderer<T extends PopupItem>(testId: string) {
  return () => {
    let el: HTMLDivElement | null = null;
    let list: T[] = [];
    let sel = 0;
    let command: ((p: T) => void) | null = null;
    const draw = (rect?: DOMRect | null) => {
      if (!el) return;
      el.innerHTML = "";
      list.forEach((it, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = it.label;
        if (it.hint) {
          const s = document.createElement("span");
          s.textContent = ` ${it.hint}`;
          s.style.color = "#676879";
          s.style.fontSize = "12px";
          b.appendChild(s);
        }
        b.dataset.testid = `${testId}-option`;
        b.className = i === sel ? "mention-item active" : "mention-item";
        b.onmousedown = (e) => { e.preventDefault(); command?.(it); };
        el!.appendChild(b);
      });
      if (rect) {
        el.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
        el.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - 320)}px`;
      }
    };
    const setProps = (props: { items: unknown[]; command: unknown; clientRect?: (() => DOMRect | null) | null }) => {
      list = props.items as T[];
      command = props.command as typeof command;
      sel = 0;
      draw(props.clientRect?.());
    };
    return {
      onStart: (props: Parameters<typeof setProps>[0]) => {
        el = document.createElement("div");
        el.className = "mention-popup";
        el.style.maxHeight = "300px";
        el.style.overflowY = "auto";
        el.setAttribute("data-testid", `${testId}-popup`);
        document.body.appendChild(el);
        setProps(props);
      },
      onUpdate: setProps,
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (!list.length) return false;
        if (event.key === "ArrowDown") { sel = (sel + 1) % list.length; draw(null); return true; }
        if (event.key === "ArrowUp") { sel = (sel - 1 + list.length) % list.length; draw(null); return true; }
        if (event.key === "Enter" || event.key === "Tab") { command?.(list[sel]); return true; }
        return false;
      },
      onExit: () => { el?.remove(); el = null; },
    };
  };
}

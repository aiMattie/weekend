import Mention from "@tiptap/extension-mention";
import type { TeamLite, UserLite } from "@/lib/board-types";
import { avatarColor, initials } from "@/lib/colors";

export interface MentionItem { id: string; label: string; kind: "user" | "team"; sub?: string }

/** Tiptap Mention extension: users AND teams. The id goes into data-id; the server expands team ids to members. */
export function buildMention(users: UserLite[], teams: TeamLite[], teamLabel: string) {
  return Mention.configure({
    HTMLAttributes: { class: "mention" },
    suggestion: {
      char: "@",
      items: ({ query }: { query: string }): MentionItem[] => {
        const q = query.toLowerCase();
        const us = users.filter((u) => u.name.toLowerCase().includes(q)).map<MentionItem>((u) => ({ id: u.id, label: u.name, kind: "user", sub: u.title ?? undefined }));
        const ts = teams.filter((x) => x.name.toLowerCase().includes(q)).map<MentionItem>((x) => ({ id: x.id, label: x.name, kind: "team", sub: teamLabel }));
        return [...us, ...ts].slice(0, 8);
      },
      render: () => {
        let el: HTMLDivElement | null = null;
        let list: MentionItem[] = [];
        let sel = 0;
        let command: ((p: { id: string; label: string }) => void) | null = null;
        const draw = (rect?: DOMRect | null) => {
          if (!el) return;
          el.innerHTML = "";
          list.forEach((it, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.dataset.testid = "mention-option";
            b.setAttribute("data-testid", "mention-option");
            b.setAttribute("data-kind", it.kind);
            b.className = i === sel ? "mention-item active" : "mention-item";
            const av = document.createElement("span");
            av.textContent = it.kind === "team" ? "#" : initials(it.label);
            av.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;font-size:10px;color:#fff;margin-right:8px;background:${it.kind === "team" ? "#7f5347" : avatarColor(it.id)}`;
            b.appendChild(av);
            b.appendChild(document.createTextNode(it.label));
            if (it.kind === "team") {
              const s = document.createElement("small");
              s.textContent = ` ${it.sub ?? ""}`;
              s.style.color = "#676879";
              b.appendChild(s);
            }
            b.onmousedown = (e) => { e.preventDefault(); command?.({ id: it.id, label: it.label }); };
            el!.appendChild(b);
          });
          if (rect) {
            el.style.left = `${Math.min(rect.left, window.innerWidth - 240)}px`;
            const below = rect.bottom + 4;
            el.style.top = `${below + 220 > window.innerHeight ? Math.max(8, rect.top - el.offsetHeight - 4) : below}px`;
          }
        };
        return {
          onStart: (props) => {
            el = document.createElement("div");
            el.className = "mention-popup";
            el.setAttribute("data-testid", "mention-popup");
            document.body.appendChild(el);
            list = props.items as MentionItem[];
            command = props.command as typeof command;
            sel = 0;
            draw(props.clientRect?.());
          },
          onUpdate: (props) => {
            list = props.items as MentionItem[];
            command = props.command as typeof command;
            sel = 0;
            draw(props.clientRect?.());
          },
          onKeyDown: ({ event }) => {
            if (!list.length) return false;
            if (event.key === "ArrowDown") { sel = (sel + 1) % list.length; draw(); return true; }
            if (event.key === "ArrowUp") { sel = (sel - 1 + list.length) % list.length; draw(); return true; }
            if (event.key === "Enter" || event.key === "Tab") { command?.(list[sel]); return true; }
            return false;
          },
          onExit: () => { el?.remove(); el = null; },
        };
      },
    },
  });
}

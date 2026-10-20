"use client";

import { Avatar } from "@vibe/core";
import type { ReactNode } from "react";
import type { BoardFull, UserLite } from "@/lib/board-types";
import { avatarColor, contrastText, initials } from "@/lib/colors";
import styles from "./cells.module.css";

export const userById = (board: BoardFull, id: string): UserLite | undefined => board.users.find((u) => u.id === id);

/** Round avatar (photo or colored initials). */
export function UserAvatar({ user, size = "small" }: { user: Pick<UserLite, "id" | "name" | "photoUrl">; size?: "xs" | "small" | "medium" }) {
  return user.photoUrl ? (
    <Avatar withoutTooltip type="img" src={user.photoUrl} size={size} tooltipProps={{ content: user.name }} aria-label={user.name}  />
  ) : (
    <Avatar withoutTooltip type="text" text={initials(user.name)} size={size} customBackgroundColor={avatarColor(user.id)} tooltipProps={{ content: user.name }} aria-label={user.name}  />
  );
}

/** Colored label pill (status/dropdown). `block` fills the whole cell. */
export function LabelPill({ text, color, block }: { text: string; color: string; block?: boolean }) {
  return (
    <span className={block ? styles.statusBlock : styles.pill} style={{ background: color, color: contrastText(color) }} title={text}>
      {text}
    </span>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <span className={styles.muted}>{children}</span>;
}

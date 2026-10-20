"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PublicUser } from "@/lib/auth";

const UserContext = createContext<PublicUser | null>(null);

export function UserProvider({ user, children }: { user: PublicUser; children: ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/** The logged-in user (client components inside the (app) layout). */
export function useCurrentUser(): PublicUser {
  const u = useContext(UserContext);
  if (!u) throw new Error("useCurrentUser must be used inside <UserProvider>");
  return u;
}

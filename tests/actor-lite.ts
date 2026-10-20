import type { Actor } from "../src/lib/actor";

export const userToActorLite = (u: { id: string; accountId: string; role: Actor["role"]; name: string; email: string }): Actor =>
  ({ id: u.id, accountId: u.accountId, role: u.role, name: u.name, email: u.email, source: "ui" });

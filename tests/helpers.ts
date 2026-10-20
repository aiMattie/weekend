/** Test helpers: fresh in-memory DB per test, seeded accounts + ready-made actors. */
import { eq } from "drizzle-orm";
import { systemActor, type Actor } from "../src/lib/actor";
import { createDb, db, setDb } from "../src/db/client";
import { seed, type SeedResult } from "../src/db/seed";
import { users } from "../src/db/schema/core";
import { userToActorLite } from "./actor-lite";
import * as boards from "../src/server/services/boards";
import * as workspaces from "../src/server/services/workspaces";

export interface Ctx extends SeedResult {
  sys: Actor;
  admin: Actor;
  member: Actor;
  viewer: Actor;
  guest: Actor;
  workspaceId: string;
  boardId: string;
}

export async function freshCtx(): Promise<Ctx> {
  setDb(createDb(":memory:"));
  const seeded = await seed({ password: "pw-for-tests", demoBoards: false });
  const actorFor = (key: string, role?: Actor["role"]): Actor => {
    const u = db.select().from(users).where(eq(users.id, seeded.userIds[key])).get()!;
    return userToActorLite({ ...u, role: role ?? u.role });
  };
  const sys = systemActor(seeded.accountId);
  const ws = workspaces.list(sys).find((w) => w.name === "Delivery")!;
  const board = boards.create(sys, { workspaceId: ws.id, name: "Test board" });
  return {
    ...seeded, sys, workspaceId: ws.id, boardId: board.id,
    admin: actorFor("admin"), member: actorFor("dev1"), viewer: actorFor("dev2", "viewer"), guest: actorFor("pm2", "guest"),
  };
}

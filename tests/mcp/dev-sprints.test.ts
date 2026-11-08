/** Sprint lifecycle over MCP (create/update/start/complete_sprint) and the sprint length setting. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { platformCtx, type PCtx } from "../platform/helpers";
import { mcpClient } from "../platform/mcp-helpers";
import { devSetup } from "../dev/helpers";
import * as services from "../../src/server/services";

/* eslint-disable @typescript-eslint/no-explicit-any */
let c: PCtx;
let m: Awaited<ReturnType<typeof mcpClient>>;
const call = async (name: string, args: Record<string, unknown> = {}): Promise<any> => {
  const r = await m.call(name, args);
  expect(r.isError, `${name}: ${r.text}`).toBe(false);
  return r.json;
};

beforeEach(async () => {
  c = await platformCtx();
  m = await mcpClient(c.admin);
});
afterEach(async () => { await m.close(); });

describe("sprint MCP tools", () => {
  it("sets a weekly sprint length, creates, updates, starts and completes a sprint", async () => {
    const { t, mkTask } = devSetup(c);
    const board = t.boards.sprints;
    expect(services.sprints.sprintSettings(c.admin, board)).toEqual({ sprintWeeks: 2 });
    expect(await call("update_sprint_settings", { board_id: board, sprint_weeks: 1 })).toEqual({ sprintWeeks: 1 });
    expect(services.sprints.planning(c.admin, board).sprintWeeks).toBe(1);

    const s = await call("create_sprint", { board_id: board, name: "2646", starts_on: "2026-11-09" });
    expect(s).toMatchObject({ name: "2646", state: "planned", startsOn: "2026-11-09", endsOn: "2026-11-13" });
    const auto = await call("create_sprint", { board_id: board });
    expect(auto).toMatchObject({ startsOn: "2026-11-16", endsOn: "2026-11-20" });

    const u = await call("update_sprint", { sprint_id: s.id, goal: "Weekdoel", ends_on: "2026-11-14" });
    expect(u).toMatchObject({ goal: "Weekdoel", endsOn: "2026-11-14" });

    const task = mkTask("Taak A");
    services.sprints.assignItem(c.admin, task, s.id);
    const started = await call("start_sprint", { sprint_id: s.id });
    expect(started.state).toBe("active");
    const again = await m.call("start_sprint", { sprint_id: auto.id });
    expect(again.isError).toBe(true);
    expect(again.text).toContain("actieve sprint");

    const done = await call("complete_sprint", { sprint_id: s.id });
    expect(done.sprint.state).toBe("completed");
    expect(done.nextSprint.id).toBe(auto.id);
    expect(done.carried.map((x: any) => x.id)).toEqual([task]);
  });

  it("rejects a sprint length outside 1-4 weeks and boards that are not sprint boards", async () => {
    const { t } = devSetup(c);
    const r = await m.call("update_sprint_settings", { board_id: t.boards.sprints, sprint_weeks: 6 });
    expect(r.isError).toBe(true);
    expect(() => services.sprints.updateSprintSettings(c.admin, t.boards.sprints, { sprintWeeks: 0 })).toThrow();
    expect(() => services.sprints.updateSprintSettings(c.admin, t.boards.taken, { sprintWeeks: 1 })).toThrow("not a sprint board");
  });
});

import { describe, expect, it } from "vitest";
import { boundsOf, connectorEnds, diffElements, edgePoint, mergeRemote, toBase, zoomAt, type El } from "@/modules/boards-extra/whiteboard/model";

const note = (id: string, x = 0, y = 0, text = ""): El => ({ id, type: "note", x, y, w: 100, h: 100, text });

describe("whiteboard model", () => {
  it("diffs against the last known server state", () => {
    const base = toBase([note("a"), note("b")]);
    const d = diffElements(base, [note("a", 5), note("c")]);
    expect(d.upsert.map((e) => e.id)).toEqual(["a", "c"]);
    expect(d.remove).toEqual(["b"]);
    expect(diffElements(base, [note("a"), note("b")])).toEqual({ upsert: [], remove: [] });
  });

  it("merges remote changes without losing unsaved local edits", () => {
    const base = toBase([note("a"), note("b"), note("c")]);
    const local = [note("a", 50, 0, "lokaal"), note("c"), note("n1")]; // edited a, removed b, added n1
    const remote = [note("a", 0, 0, "remote"), note("b", 9), note("c", 7), note("r1")]; // others changed a, b, c and added r1
    const m = mergeRemote(local, base, remote);
    const byId = new Map(m.elements.map((e) => [e.id, e]));
    expect(byId.get("a")?.text).toBe("lokaal"); // local edit wins
    expect(byId.has("b")).toBe(false); // removed locally stays removed
    expect(byId.get("c")?.x).toBe(7); // untouched locally -> remote
    expect(byId.has("r1")).toBe(true);
    expect(byId.has("n1")).toBe(true);
    // pending work is still detected after the merge
    const d = diffElements(m.base, m.elements);
    expect(d.upsert.map((e) => e.id).sort()).toEqual(["a", "n1"]);
    expect(d.remove).toEqual(["b"]);
  });

  it("drops elements that were removed remotely", () => {
    const base = toBase([note("a"), note("b")]);
    const m = mergeRemote([note("a"), note("b")], base, [note("a")]);
    expect(m.elements.map((e) => e.id)).toEqual(["a"]);
  });

  it("connectors follow their elements and end on the borders", () => {
    const a = note("a", 0, 0);
    const b = note("b", 300, 0);
    const all = new Map([[a.id, a], [b.id, b]]);
    const c: El = { id: "c", type: "connector", x: 0, y: 0, from: "a", to: "b" };
    const [p, q] = connectorEnds(c, all);
    expect(p).toEqual([100, 50]);
    expect(q).toEqual([300, 50]);
    all.set("b", { ...b, y: 200 });
    expect(connectorEnds(c, all)[1][1]).toBeGreaterThan(50);
    expect(boundsOf(c, all).w).toBeGreaterThan(0);
  });

  it("computes edge points and zoom around the cursor", () => {
    expect(edgePoint({ x: 0, y: 0, w: 100, h: 50 }, [200, 25])).toEqual([100, 25]);
    const v = zoomAt({ x: 0, y: 0, zoom: 1 }, 2, 100, 100);
    expect(v.zoom).toBe(2);
    expect(v.x).toBe(-100); // the point under the cursor stays put
    expect(zoomAt({ x: 0, y: 0, zoom: 3.9 }, 2, 0, 0).zoom).toBe(4);
  });
});

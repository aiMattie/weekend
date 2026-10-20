import { describe, expect, it } from "vitest";
import { computePosition as clientPos } from "../../src/components/board/grid/position";
import { computePosition as serverPos } from "../../src/server/services/_shared";

const sibs = [1000, 2000, 2500, 4000].map((position, i) => ({ id: String(i + 1), position }));

describe("client computePosition mirrors the server (optimistic moves land where the server puts them)", () => {
  const specs = [{}, { top: true }, { beforeId: "1" }, { beforeId: "3" }, { afterId: "4" }, { afterId: "2" }, { position: 42 }, { beforeId: "nope" }];
  for (const spec of specs) {
    it(`spec ${JSON.stringify(spec)}`, () => {
      expect(clientPos(sibs, spec)).toBe(serverPos(sibs, spec));
      expect(clientPos([], spec)).toBe(serverPos([], spec));
    });
  }
});

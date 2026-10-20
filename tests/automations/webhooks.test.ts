import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../../src/db/client";
import { webhookDeliveries } from "../../src/db/schema/webhooks";
import * as webhooks from "../../src/server/services/webhooks";
import * as items from "../../src/server/services/items";
import { startWebhookDispatcher } from "../../src/server/services/webhooks";
import { autoCtx, newItem, type AutoCtx } from "./setup";

let c: AutoCtx;
beforeEach(async () => { c = await autoCtx(); });

describe("signing", () => {
  it("signs and verifies, rejects tampering, wrong secret and old timestamps", () => {
    const body = JSON.stringify({ a: 1 });
    const h = webhooks.signatureHeader("s3cret", body, 1_700_000_000);
    expect(h).toMatch(/^t=1700000000,v1=[0-9a-f]{64}$/);
    expect(webhooks.verifySignature("s3cret", body, h, { nowSec: 1_700_000_100 })).toBe(true);
    expect(webhooks.verifySignature("s3cret", body + " ", h, { nowSec: 1_700_000_100 })).toBe(false);
    expect(webhooks.verifySignature("other", body, h, { nowSec: 1_700_000_100 })).toBe(false);
    expect(webhooks.verifySignature("s3cret", body, h, { nowSec: 1_700_001_000 })).toBe(false);
    expect(webhooks.verifySignature("s3cret", body, "garbage")).toBe(false);
  });
});

describe("deliveries", () => {
  it("queues deliveries for matching events, sends a signed POST and logs success", async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    webhooks.setWebhookFetch(async (url, init) => { calls.push({ url, headers: init.headers, body: init.body }); return { status: 200, text: async () => "ok" }; });
    try {
      const ep = webhooks.create(c.admin, { boardId: c.boardId, url: "http://localhost:9999/hook", events: ["create_item"] });
      webhooks.create(c.admin, { boardId: c.boardId, url: "http://localhost:9999/other", events: ["item_deleted"] });
      expect(ep.secret).toMatch(/^whsec_/);
      const it1 = newItem(c, "Hook me");
      const queued = webhooks.dispatchEvent({ type: "item.created", boardId: c.boardId, actorId: null, at: new Date().toISOString(), itemId: it1.id });
      expect(queued).toHaveLength(1);
      expect(await webhooks.processDue()).toBeGreaterThanOrEqual(1);
      const call = calls.find((x) => x.url.endsWith("/hook"))!;
      const parsed = JSON.parse(call.body);
      expect(parsed.event).toMatchObject({ type: "create_item", itemId: it1.id, pulseName: "Hook me", boardId: c.boardId });
      expect(webhooks.verifySignature(ep.secret, call.body, call.headers["X-Webhook-Signature"])).toBe(true);
      expect(call.headers["X-Webhook-Event"]).toBe("create_item");
      const log = webhooks.listDeliveries(c.admin, ep.id);
      expect(log.find((d) => d.event === "create_item")).toMatchObject({ status: "success", attempts: 1, responseStatus: 200 });
    } finally { webhooks.setWebhookFetch(null); }
  });

  it("retries with backoff and ends dead after the last attempt", async () => {
    let calls = 0;
    webhooks.setWebhookFetch(async () => { calls++; return { status: 503, text: async () => "down" }; });
    try {
      const ep = webhooks.create(c.admin, { boardId: c.boardId, url: "http://localhost:9999/hook", events: ["*"] });
      const d = webhooks.enqueue(ep, "create_item", { event: { type: "create_item" } });
      let now = new Date();
      let row = await webhooks.deliver(d.id, now);
      expect(row.status).toBe("pending");
      expect(row.attempts).toBe(1);
      expect(Date.parse(row.nextAttemptAt!) - now.getTime()).toBe(30_000);
      // not due yet
      expect(await webhooks.processDue(new Date(now.getTime() + 10_000))).toBe(0);
      const delays = [30, 120, 600, 3600, 21_600];
      for (let i = 1; i < webhooks.MAX_ATTEMPTS; i++) {
        now = new Date(Date.parse(row.nextAttemptAt!) + 1000);
        expect(await webhooks.processDue(now)).toBe(1);
        row = db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, d.id)).get()!;
        if (i < webhooks.MAX_ATTEMPTS - 1) expect(Date.parse(row.nextAttemptAt!) - now.getTime()).toBe(delays[i] * 1000);
      }
      expect(row.status).toBe("dead");
      expect(row.attempts).toBe(webhooks.MAX_ATTEMPTS);
      expect(row.error).toMatch(/503/);
      expect(calls).toBe(webhooks.MAX_ATTEMPTS);
      // manual retry works once the receiver is back
      webhooks.setWebhookFetch(async () => ({ status: 200, text: async () => "ok" }));
      expect((await webhooks.retryDelivery(c.admin, d.id)).status).toBe("success");
    } finally { webhooks.setWebhookFetch(null); }
  });

  it("the bus dispatcher turns real item changes into deliveries", async () => {
    startWebhookDispatcher();
    webhooks.setWebhookFetch(async () => ({ status: 200, text: async () => "ok" }));
    try {
      const ep = webhooks.create(c.admin, { boardId: c.boardId, url: "http://localhost:9999/hook", events: ["change_status_column_value"] });
      const it1 = newItem(c);
      items.changeColumnValue(c.admin, it1.id, "status", "Done");
      await new Promise((r) => setTimeout(r, 50));
      const log = webhooks.listDeliveries(c.admin, ep.id);
      expect(log).toHaveLength(1);
      expect(log[0].payload).toMatchObject({ event: { columnType: "status", value: { index: 1 } } });
    } finally { webhooks.setWebhookFetch(null); }
  });

  it("only board editors may manage endpoints and only http(s) urls are accepted", () => {
    expect(() => webhooks.create(c.viewer, { boardId: c.boardId, url: "http://x.test/h" })).toThrow();
    expect(() => webhooks.create(c.admin, { boardId: c.boardId, url: "ftp://x.test/h" })).toThrow(/http/);
    expect(webhooks.list(c.admin, { boardId: c.boardId })).toHaveLength(0);
  });
});

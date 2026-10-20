import net from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sendMail, setMailTransport } from "../../src/server/automations/mailer";
import * as integrations from "../../src/server/services/integrations";
import * as items from "../../src/server/services/items";
import * as webhooks from "../../src/server/services/webhooks";
import { autoCtx, type AutoCtx } from "./setup";

/** Tiny SMTP sink that records the DATA of each mail (stands in for the local mail catcher). */
function smtpSink(): Promise<{ port: number; mails: string[]; close: () => void }> {
  return new Promise((resolve) => {
    const mails: string[] = [];
    const server = net.createServer((sock) => {
      sock.write("220 sink ESMTP\r\n");
      let data = false;
      let buf = "";
      sock.on("data", (d) => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf("\r\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 2);
          if (data) { if (line === ".") { data = false; sock.write("250 queued\r\n"); } else mails[mails.length - 1] += line + "\n"; continue; }
          if (/^EHLO/i.test(line)) sock.write("250 sink\r\n");
          else if (/^(MAIL|RCPT)/i.test(line)) { sock.write("250 ok\r\n"); if (/^MAIL/i.test(line)) mails.push(`${line}\n`); else mails[mails.length - 1] += `${line}\n`; }
          else if (/^DATA/i.test(line)) { data = true; sock.write("354 go\r\n"); }
          else if (/^QUIT/i.test(line)) { sock.write("221 bye\r\n"); sock.end(); }
        }
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as net.AddressInfo).port, mails, close: () => server.close() }));
  });
}

describe("smtp mailer", () => {
  afterEach(() => { delete process.env.SMTP_PORT; setMailTransport(null); });
  it("delivers to an SMTP server configured by env (mail catcher)", async () => {
    const sink = await smtpSink();
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(sink.port);
    setMailTransport(null);
    await sendMail({ to: ["dev1@example.com"], subject: "Hallo wêreld", text: "Regel 1\n.stip\nRegel 3" });
    sink.close();
    expect(sink.mails).toHaveLength(1);
    expect(sink.mails[0]).toContain("RCPT TO:<dev1@example.com>");
    expect(sink.mails[0]).toContain("Subject: =?UTF-8?B?");
    const body = /base64\n\n([\s\S]*)/.exec(sink.mails[0])![1].replace(/\n/g, "");
    expect(Buffer.from(body, "base64").toString()).toBe("Regel 1\n.stip\nRegel 3");
  });
});

describe("integrations", () => {
  let c: AutoCtx;
  beforeEach(async () => { c = await autoCtx(); });

  it("reports not connected until configured and only admins manage them", () => {
    const slack = integrations.create(c.admin, { kind: "slack" });
    expect(slack.connected).toBe(false);
    expect(integrations.update(c.admin, slack.id, { config: { webhookUrl: "https://hooks.slack.test/x" } }).connected).toBe(true);
    expect(() => integrations.list(c.member)).toThrow();
    const gh = integrations.create(c.admin, { kind: "github", boardId: c.boardId, config: { secret: "abc" } });
    expect(gh.connected).toBe(true);
    expect(gh.inboundPath).toMatch(/^\/api\/public\/hooks\/[0-9a-f]{40}$/);
  });

  it("inbound webhook creates an item with mapped columns and a GitHub signature check", async () => {
    const hook = integrations.create(c.admin, { kind: "webhook_in", boardId: c.boardId, config: { mapping: { date: "$.due", name: "$.title" } } });
    const r = integrations.receiveInbound(hook.token!, new Headers(), JSON.stringify({ title: "Van buiten", due: "2026-12-24" }));
    const it1 = items.get(c.admin, r.itemId!);
    expect(it1.name).toBe("Van buiten");
    expect(it1.values[c.dateId]).toEqual({ date: "2026-12-24" });
    expect(() => integrations.receiveInbound("nope", new Headers(), "{}")).toThrow(/not found/i);
    expect(() => integrations.receiveInbound(hook.token!, new Headers(), "not json")).toThrow(/JSON/);

    const gh = integrations.create(c.admin, { kind: "github", boardId: c.boardId, config: { secret: "topsecret" } });
    const body = JSON.stringify({ action: "opened", issue: { number: 7, title: "Bug", html_url: "https://gh/7", body: "stuk" } });
    const { createHmac } = await import("node:crypto");
    const sig = `sha256=${createHmac("sha256", "topsecret").update(body).digest("hex")}`;
    expect(() => integrations.receiveInbound(gh.token!, new Headers({ "x-github-event": "issues", "x-hub-signature-256": "sha256=" + "0".repeat(64) }), body)).toThrow(/signature/i);
    const ok = integrations.receiveInbound(gh.token!, new Headers({ "x-github-event": "issues", "x-hub-signature-256": sig }), body);
    expect(items.get(c.admin, ok.itemId!).name).toBe("#7 Bug");
    expect(integrations.receiveInbound(gh.token!, new Headers({ "x-github-event": "ping", "x-hub-signature-256": `sha256=${createHmac("sha256", "topsecret").update(body).digest("hex")}` }), body).skipped).toBe("ping");
  });

  it("chat message posts a Slack-style payload and refuses a not connected integration", async () => {
    const calls: { url: string; body: string }[] = [];
    webhooks.setWebhookFetch(async (url, init) => { calls.push({ url, body: init.body }); return { status: 200, text: async () => "ok" }; });
    try {
      const slack = integrations.create(c.admin, { kind: "slack", config: { webhookUrl: "https://hooks.slack.test/x" } });
      await integrations.sendChat(c.accountId, slack.id, "Hoi");
      expect(JSON.parse(calls[0].body)).toEqual({ text: "Hoi" });
      const teams = integrations.create(c.admin, { kind: "teams" });
      await expect(integrations.sendChat(c.accountId, teams.id, "x")).rejects.toThrow(/not connected/);
    } finally { webhooks.setWebhookFetch(null); }
  });
});

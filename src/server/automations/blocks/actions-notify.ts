/** Notification, email and integration actions. */
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../db/client";
import { users as userRows } from "../../../db/schema/core";
import { ValidationError } from "../../../lib/errors";
import * as integrations from "../../services/integrations";
import * as webhooks from "../../services/webhooks";
import { sendMail } from "../mailer";
import { notifyUsers, appUrl } from "../notify";
import { resolveUsers } from "./helpers";
import type { AutomationBlock } from "./types";

const t = (nl: string, en: string) => ({ nl, en });
const idish = z.union([z.string(), z.number()]).transform(String);
const recipients = z.array(idish).default([]);
const MSG_HINT = t("Gebruik {item}, {board}, {from}, {to}, {user}", "Use {item}, {board}, {from}, {to}, {user}");

export const notifyAction: AutomationBlock<{ recipients: string[]; message: string; email?: boolean; subject?: string }> = {
  id: "notify", kind: "action", label: "Send a notification", title: t("Stuur een melding", "Send a notification"), category: "notifications",
  configSchema: z.object({ recipients, message: z.string().min(1).default("{item}"), email: z.boolean().default(false), subject: z.string().optional() }),
  fields: [
    { key: "recipients", kind: "users", label: t("aan", "to"), required: true },
    { key: "message", kind: "longtext", label: t("bericht", "message"), required: true, default: "{item}", placeholder: MSG_HINT },
    { key: "email", kind: "boolean", label: t("ook e-mailen", "also email"), default: false },
  ],
  async run(ctx) {
    const ids = resolveUsers(ctx, ctx.config.recipients);
    if (!ids.length) throw new ValidationError("No recipients found for this notification");
    const it = ctx.item();
    const msg = ctx.render(ctx.config.message);
    const n = await notifyUsers(ctx.actor, ids, { title: msg.slice(0, 200), body: it ? `${it.name}` : undefined, boardId: ctx.boardId, itemId: it?.id, email: ctx.config.email, subject: ctx.config.subject ? ctx.render(ctx.config.subject) : undefined });
    return `${n} user(s)`;
  },
};

export const sendEmail: AutomationBlock<{ recipients: string[]; emails?: string; subject: string; body: string }> = {
  id: "send_email", kind: "action", label: "Send an email", title: t("Stuur een e-mail", "Send an email"), category: "notifications",
  configSchema: z.object({ recipients, emails: z.string().optional(), subject: z.string().min(1), body: z.string().default("{item}") }),
  fields: [
    { key: "recipients", kind: "users", label: t("aan", "to") },
    { key: "emails", kind: "text", label: t("extra e-mailadressen", "extra email addresses"), placeholder: t("a@x.nl, b@y.nl", "a@x.nl, b@y.nl") },
    { key: "subject", kind: "text", label: t("onderwerp", "subject"), required: true, placeholder: MSG_HINT },
    { key: "body", kind: "longtext", label: t("bericht", "body"), default: "{item}", placeholder: MSG_HINT },
  ],
  async run(ctx) {
    const ids = resolveUsers(ctx, ctx.config.recipients);
    const fromUsers = ids.length ? db.select({ email: userRows.email }).from(userRows).where(inArray(userRows.id, ids)).all().map((u) => u.email) : [];
    const extra = (ctx.config.emails ?? "").split(/[,;\s]+/).filter((e) => /^[^@\s]+@[^@\s]+$/.test(e));
    const to = [...new Set([...fromUsers, ...extra])];
    if (!to.length) throw new ValidationError("No email recipients");
    const it = ctx.item();
    const link = it ? `\n\n${appUrl()}/boards/${it.boardId}?item=${it.id}` : "";
    await sendMail({ to, subject: ctx.render(ctx.config.subject), text: ctx.render(ctx.config.body) + link });
    return `${to.length} address(es)`;
  },
};

export const webhookPost: AutomationBlock<{ url: string; body?: string; secret?: string }> = {
  id: "webhook_post", kind: "action", label: "Send a webhook", title: t("Stuur een webhook (POST)", "Send a webhook (POST)"), category: "integrations",
  configSchema: z.object({ url: z.string().url(), body: z.string().optional(), secret: z.string().optional() }),
  fields: [
    { key: "url", kind: "url", label: t("URL", "URL"), required: true, placeholder: t("https://voorbeeld.nl/hook", "https://example.com/hook") },
    { key: "body", kind: "longtext", label: t("JSON-body (leeg = standaard)", "JSON body (empty = default)") },
    { key: "secret", kind: "text", label: t("HMAC-secret", "HMAC secret") },
  ],
  async run(ctx) {
    const it = ctx.item();
    let payload: unknown;
    if (ctx.config.body?.trim()) {
      const rendered = ctx.render(ctx.config.body);
      try { payload = JSON.parse(rendered); } catch { payload = { text: rendered }; }
    } else {
      payload = { event: ctx.trigger.type, automationId: ctx.run.automationId, boardId: ctx.boardId, item: it ? { id: it.id, name: it.name, groupId: it.groupId } : null, vars: ctx.vars(), at: ctx.now().toISOString() };
    }
    const r = await webhooks.postSigned(ctx.config.url, payload, { secret: ctx.config.secret || undefined, event: ctx.trigger.type });
    return `HTTP ${r.status}`;
  },
};

export const chatMessage: AutomationBlock<{ integrationId: string; text: string }> = {
  id: "chat_message", kind: "action", label: "Send a Slack/Teams message", title: t("Stuur een Slack/Teams-bericht", "Send a Slack/Teams message"), category: "integrations",
  configSchema: z.object({ integrationId: idish.pipe(z.string().min(1)), text: z.string().min(1) }),
  fields: [
    { key: "integrationId", kind: "integration", label: t("kanaal", "channel"), required: true },
    { key: "text", kind: "longtext", label: t("bericht", "message"), required: true, placeholder: MSG_HINT },
  ],
  async run(ctx) {
    await integrations.sendChat(ctx.accountId, ctx.config.integrationId, ctx.render(ctx.config.text));
  },
};

export const notifyActions: AutomationBlock<never>[] = [notifyAction, sendEmail, webhookPost, chatMessage] as AutomationBlock<never>[];

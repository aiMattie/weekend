/**
 * Minimal SMTP client (no dependencies). Defaults to the local mail catcher at 127.0.0.1:1025.
 * Env: SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASS, SMTP_SECURE (true = implicit TLS).
 * STARTTLS is used automatically when the server offers it and credentials are set.
 */
import net from "node:net";
import tls from "node:tls";

export interface Mail { to: string[]; subject: string; text: string; html?: string; from?: string }
export type MailTransport = (mail: Mail) => Promise<void>;

const g = globalThis as unknown as { __autoMailTransport?: MailTransport | null };
/** Tests swap the transport; null restores SMTP. */
export function setMailTransport(t: MailTransport | null): void { g.__autoMailTransport = t; }

export const smtpConfig = () => ({
  host: process.env.SMTP_HOST || "127.0.0.1",
  port: Number(process.env.SMTP_PORT || 1025),
  from: process.env.SMTP_FROM || "weekend@example.com",
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  secure: process.env.SMTP_SECURE === "true",
});

const b64 = (s: string) => Buffer.from(s).toString("base64");
const encodeHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

export function buildMessage(mail: Mail, from: string, now = new Date()): string {
  const boundary = `b${Math.random().toString(36).slice(2)}`;
  const head = [
    `From: ${from}`, `To: ${mail.to.join(", ")}`, `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${now.toUTCString()}`, `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@weekend.local>`, "MIME-Version: 1.0",
  ];
  const body = mail.html
    ? [`Content-Type: multipart/alternative; boundary="${boundary}"`, "", `--${boundary}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(mail.text).replace(/(.{76})/g, "$1\r\n"), `--${boundary}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(mail.html).replace(/(.{76})/g, "$1\r\n"), `--${boundary}--`]
    : ["Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", b64(mail.text).replace(/(.{76})/g, "$1\r\n")];
  return [...head, ...body].join("\r\n");
}

/** Line based SMTP conversation. */
class Smtp {
  private buf = "";
  private waiters: ((r: { code: number; lines: string[] }) => void)[] = [];
  private pending: string[] = [];
  constructor(public sock: net.Socket | tls.TLSSocket) { this.attach(sock); }
  private attach(s: net.Socket) {
    s.setEncoding("utf8");
    s.on("data", (d: string) => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf("\r\n")) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 2);
        this.pending.push(line);
        if (/^\d{3} /.test(line)) {
          const lines = this.pending; this.pending = [];
          this.waiters.shift()?.({ code: Number(line.slice(0, 3)), lines });
        }
      }
    });
  }
  read(): Promise<{ code: number; lines: string[] }> { return new Promise((res) => this.waiters.push(res)); }
  async cmd(line: string, ok: number[]): Promise<string[]> {
    const p = this.read();
    this.sock.write(line + "\r\n");
    const r = await p;
    if (!ok.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.lines.join(" ")}`);
    return r.lines;
  }
  async upgrade(host: string): Promise<void> {
    const secure = tls.connect({ socket: this.sock as net.Socket, servername: host });
    await new Promise<void>((res, rej) => { secure.once("secureConnect", res); secure.once("error", rej); });
    this.sock = secure; this.buf = ""; this.attach(secure);
  }
}

async function smtpSend(mail: Mail): Promise<void> {
  const cfg = smtpConfig();
  const from = mail.from ?? cfg.from;
  const sock: net.Socket = await new Promise((res, rej) => {
    const s = cfg.secure ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }, () => res(s)) : net.connect({ host: cfg.host, port: cfg.port }, () => res(s));
    s.once("error", rej);
    s.setTimeout(15_000, () => { s.destroy(new Error("SMTP timeout")); });
  });
  const smtp = new Smtp(sock);
  try {
    const greet = await smtp.read();
    if (greet.code !== 220) throw new Error(`SMTP greeting ${greet.code}`);
    let caps = await smtp.cmd("EHLO weekend.local", [250]);
    if (!cfg.secure && cfg.user && caps.some((l) => /STARTTLS/i.test(l))) {
      await smtp.cmd("STARTTLS", [220]);
      await smtp.upgrade(cfg.host);
      caps = await smtp.cmd("EHLO weekend.local", [250]);
    }
    if (cfg.user) await smtp.cmd(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.pass}`)}`, [235]);
    await smtp.cmd(`MAIL FROM:<${from.replace(/^.*<|>.*$/g, "")}>`, [250]);
    for (const to of mail.to) await smtp.cmd(`RCPT TO:<${to}>`, [250, 251]);
    await smtp.cmd("DATA", [354]);
    const msg = buildMessage(mail, from).replace(/^\./gm, "..");
    await smtp.cmd(`${msg}\r\n.`, [250]);
    await smtp.cmd("QUIT", [221]).catch(() => undefined);
  } finally {
    smtp.sock.destroy();
  }
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!mail.to.length) return;
  if (g.__autoMailTransport) return g.__autoMailTransport(mail);
  return smtpSend(mail);
}

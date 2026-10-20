import { beforeEach, describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateRecoveryCodes, generateSecret, hashCode, hotp, otpauthUri, totpAt, verifyTotp } from "../../src/modules/admin/lib/totp";
import { seal, unseal } from "../../src/modules/admin/lib/seal";
import * as twofactor from "../../src/server/services/twofactor";
import { freshCtx, type Ctx } from "../helpers";

// RFC 6238 appendix B secret "12345678901234567890" (SHA-1)
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238 / RFC 4226)", () => {
  it("base32 round trips", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC_SECRET).toString()).toBe("12345678901234567890");
    const s = generateSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
  });

  it("matches the RFC 4226 HOTP vectors", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"];
    expected.forEach((code, i) => expect(hotp(RFC_SECRET, i)).toBe(code));
  });

  it("matches the RFC 6238 SHA-1 vectors (8 digits)", () => {
    const vectors: [number, string][] = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
    for (const [t, code] of vectors) expect(totpAt(RFC_SECRET, t * 1000, 8)).toBe(code);
    expect(totpAt(RFC_SECRET, 59_000)).toBe("287082");
  });

  it("verifies with a +-1 step window, rejects replay and garbage", () => {
    const now = 1_700_000_000_000;
    const code = totpAt(RFC_SECRET, now);
    const step = verifyTotp(RFC_SECRET, code, { timeMs: now });
    expect(step).toBe(Math.floor(now / 30000));
    expect(verifyTotp(RFC_SECRET, code, { timeMs: now + 30_000 })).toBe(step); // clock drift
    expect(verifyTotp(RFC_SECRET, code, { timeMs: now + 90_000 })).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, { timeMs: now, afterStep: step })).toBeNull(); // replay
    expect(verifyTotp(RFC_SECRET, "000000", { timeMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abc", { timeMs: now })).toBeNull();
    expect(verifyTotp(RFC_SECRET, ` ${code.slice(0, 3)} ${code.slice(3)} `, { timeMs: now })).toBe(step);
  });

  it("builds an otpauth uri and recovery codes", () => {
    const uri = otpauthUri("ABC", "admin@example.com");
    expect(uri).toBe("otpauth://totp/Weekend%3Aadmin%40example.com?secret=ABC&issuer=Weekend&algorithm=SHA1&digits=6&period=30");
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);
    expect(hashCode(" ABCD-1234 ")).toBe(hashCode("abcd-1234"));
  });

  it("seals secrets with AES-GCM", () => {
    const s = seal("JBSWY3DPEHPK3PXP");
    expect(s).not.toContain("JBSWY3");
    expect(unseal(s)).toBe("JBSWY3DPEHPK3PXP");
    expect(() => unseal(s.replace(/.$/, (ch) => (ch === "0" ? "1" : "0")))).toThrow();
  });
});

describe("2FA service", () => {
  let c: Ctx;
  beforeEach(async () => { c = await freshCtx(); });

  it("setup, confirm, recovery codes, second factor, disable", async () => {
    expect(twofactor.status(c.member)).toEqual({ enabled: false, recoveryCodesLeft: 0 });
    const setup = await twofactor.beginSetup(c.member);
    expect(setup.secret).toMatch(/^[A-Z2-7]+$/);
    expect(setup.uri).toContain(setup.secret);
    expect(setup.qrSvg).toContain("<svg");
    expect(() => twofactor.confirmSetup(c.member, "000000")).toThrow(/Invalid code/);
    const { recoveryCodes } = twofactor.confirmSetup(c.member, totpAt(setup.secret));
    expect(recoveryCodes).toHaveLength(10);
    expect(twofactor.status(c.member)).toEqual({ enabled: true, recoveryCodesLeft: 10 });

    // the same code cannot be used twice, a later step works
    expect(twofactor.verifySecondFactor(c.member.id, { code: totpAt(setup.secret) }).ok).toBe(false);
    expect(twofactor.verifySecondFactor(c.member.id, { code: totpAt(setup.secret, Date.now() + 30_000) }).ok).toBe(true);
    // recovery codes are single use
    expect(twofactor.verifySecondFactor(c.member.id, { recoveryCode: recoveryCodes[0] })).toEqual({ ok: true, usedRecovery: true });
    expect(twofactor.verifySecondFactor(c.member.id, { recoveryCode: recoveryCodes[0] }).ok).toBe(false);
    expect(twofactor.status(c.member).recoveryCodesLeft).toBe(9);
    expect(twofactor.regenerateRecoveryCodes(c.member).recoveryCodes).toHaveLength(10);

    await expect(twofactor.disable(c.member, "fout")).rejects.toThrow(/password/i);
    await twofactor.disable(c.member, "pw-for-tests");
    expect(twofactor.status(c.member).enabled).toBe(false);
  });

  it("admins can reset 2FA of someone else; members cannot", async () => {
    const setup = await twofactor.beginSetup(c.member);
    twofactor.confirmSetup(c.member, totpAt(setup.secret));
    expect(() => twofactor.reset(c.viewer, c.member.id)).toThrow(/Not allowed/);
    twofactor.reset(c.admin, c.member.id);
    expect(twofactor.status(c.member).enabled).toBe(false);
  });
});

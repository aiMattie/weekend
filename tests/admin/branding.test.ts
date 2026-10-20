import { beforeEach, describe, expect, it } from "vitest";
import { freshCtx, type Ctx } from "../helpers";
import * as account from "../../src/server/services/account";
import { removeImage } from "../../src/modules/admin/lib/images";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4ea0000000049454e44ae426082", "hex");

describe("public branding", () => {
  let ctx: Ctx;
  beforeEach(async () => { ctx = await freshCtx(); removeImage("logo", ctx.accountId); });

  it("returns the account name and no logo by default", () => {
    const b = account.publicBranding()!;
    expect(b.name).toBe(account.get(ctx.admin).name);
    expect(b.hasLogo).toBe(false);
    expect(account.publicLogo()).toBeNull();
  });

  it("follows name and logo changes from Admin > Account", () => {
    account.update(ctx.admin, { name: "Example BV" });
    account.setLogo(ctx.admin, PNG);
    const b = account.publicBranding()!;
    expect(b.name).toBe("Example BV");
    expect(b.hasLogo).toBe(true);
    expect(b.logoVersion).toMatch(/^\d+$/);
    expect(account.publicLogo()?.mime).toBe("image/png");
    account.setLogo(ctx.admin, null);
    expect(account.publicBranding()!.hasLogo).toBe(false);
  });
});

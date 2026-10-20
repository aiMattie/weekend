import { api } from "@/server/http";
import { devTemplate } from "@/server/services";

import { ForbiddenError } from "@/lib/errors";

/** Build (or repair) the Development workspace. Admins only. Body: { workspaceName?, demo? } */
export const POST = api(async ({ actor, body }) => {
  if (actor.role !== "admin" && !actor.isSystem) throw new ForbiddenError();
  const b = await body();
  return devTemplate.createDevWorkspaceTemplate(actor.accountId, { workspaceName: typeof b.workspaceName === "string" ? b.workspaceName : undefined, demo: b.demo === true });
}, { status: 201 });

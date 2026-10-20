import { ForbiddenError } from "@/lib/errors";
import { api } from "@/server/http";
import { profileView, unlinkIdentity } from "@/server/services/sso-settings";

export const GET = api(({ actor }) => profileView(actor));
export const DELETE = api(({ actor }) => {
  const idn = profileView(actor).identity;
  if (!idn) throw new ForbiddenError("Er is geen Google-account gekoppeld");
  unlinkIdentity(actor, idn.id);
  return profileView(actor);
});

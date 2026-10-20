/**
 * Recovery when "Alleen inloggen met Google" locks people out (Google down, env vars lost, wrong account linked):
 *   npm run auth:break-glass -- <email>
 * Turns SSO enforcement off for the account of that user, flags them as break-glass admin (when they are an admin)
 * and audits it. Their password keeps working. DATABASE_URL selects the database (default file:data/app.db).
 */
import "./_env";
import { disableEnforcementFor } from "../src/server/services/sso-settings";

const email = process.argv.slice(2).find((a) => !a.startsWith("-"));
if (!email) {
  console.error("usage: npm run auth:break-glass -- <e-mailadres>");
  process.exit(1);
}
const r = disableEnforcementFor(email);
if (!r.found) {
  console.error(`Geen gebruiker met e-mailadres ${email}`);
  process.exit(1);
}
console.log(r.wasEnforced ? "'Alleen inloggen met Google' staat nu uit; inloggen met een wachtwoord werkt weer." : "'Alleen inloggen met Google' stond al uit.");
if (r.admin) console.log("Deze beheerder is als noodtoegang gemarkeerd.");

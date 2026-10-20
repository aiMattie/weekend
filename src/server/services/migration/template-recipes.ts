/** Recipe definitions shipped with the templates (JSON the automations module can load). */
import type { Actor } from "../../../lib/actor";
import { db } from "../../../db/client";
import { automations } from "../../../db/schema/automations";
import { and, eq } from "drizzle-orm";
import * as automationsSvc from "../automations";
import * as formsSvc from "../forms";
import recipe from "../../../modules/migration/recipes/uren-nieuwe-regel.json";

/** Automation "nieuwe regel -> Wie = jijzelf, Datum = vandaag" as a loadable definition. */
export const HOURS_QUICK_ENTRY_RECIPE = recipe;

/**
 * Install the recipe on the Urenregistratie board as an active automation (once). Returns the recipe id
 * (null when the automations module rejects it, e.g. while it is still being built).
 */
export function installHoursRecipe(sys: Actor, urenBoardId: string): string | null {
  const name = recipe.name.nl;
  if (db.select().from(automations).where(and(eq(automations.boardId, urenBoardId), eq(automations.recipeId, recipe.id))).get()) return recipe.id;
  try {
    automationsSvc.create(sys, { boardId: urenBoardId, name, description: recipe.description.nl, trigger: recipe.trigger, steps: recipe.steps, recipeId: recipe.id, active: true });
    return recipe.id;
  } catch (e) {
    console.warn(`[templates] hours recipe not installed: ${(e as Error).message}`);
    return null;
  }
}

/**
 * "Snel formulier": a WorkForm on Urenregistratie. Left unpublished on purpose (a public link
 * writes to the board without login); a board owner publishes it from the Forms page when wanted.
 */
export function ensureHoursForm(sys: Actor, urenBoardId: string): string | null {
  const name = "Uren snel invullen";
  try {
    const have = formsSvc.list(sys, { boardId: urenBoardId }).find((f) => f.name === name);
    return have?.id ?? formsSvc.create(sys, { boardId: urenBoardId, name }).form.id;
  } catch (e) {
    console.warn(`[templates] hours form not created: ${(e as Error).message}`);
    return null;
  }
}

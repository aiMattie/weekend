/** Grouping of workspaces by their free-text `category` for the workspace switcher. */

/** Categories that always come first in the switcher (matched case-insensitively), in this order. */
export const PINNED_CATEGORIES = ["klanten", "clients"];

const pinRank = (label: string) => {
  const i = PINNED_CATEGORIES.indexOf(label.toLocaleLowerCase("nl"));
  return i === -1 ? PINNED_CATEGORIES.length : i;
};

export interface WorkspaceGroup<W> {
  /** Display label of the category (first spelling seen); null = workspaces without a category. */
  category: string | null;
  workspaces: W[];
}

/**
 * Groups workspaces by category. Categories match case-insensitively; pinned
 * categories ("Klanten"/"Clients") come first, the others alphabetically after
 * them, and workspaces without a category come last. Within a
 * group the incoming order (position) is kept.
 */
export function groupWorkspaces<W extends { category?: string | null }>(list: W[]): WorkspaceGroup<W>[] {
  const groups = new Map<string, WorkspaceGroup<W>>();
  const rest: W[] = [];
  for (const w of list) {
    const label = w.category?.trim();
    if (!label) { rest.push(w); continue; }
    const key = label.toLocaleLowerCase("nl");
    const g = groups.get(key);
    if (g) g.workspaces.push(w);
    else groups.set(key, { category: label, workspaces: [w] });
  }
  const sorted = [...groups.values()].sort((a, b) =>
    pinRank(a.category!) - pinRank(b.category!) || a.category!.localeCompare(b.category!, "nl", { sensitivity: "base" }));
  return rest.length ? [...sorted, { category: null, workspaces: rest }] : sorted;
}

/** Distinct category labels, sorted, for suggestions in the edit dialog. */
export function workspaceCategories(list: { category?: string | null }[]): string[] {
  return groupWorkspaces(list).flatMap((g) => (g.category ? [g.category] : []));
}

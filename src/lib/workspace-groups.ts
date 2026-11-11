/** Grouping of workspaces by their free-text `category` for the workspace switcher. */

/** Categories that always come first in the switcher (matched case-insensitively), in this order. */
export const PINNED_CATEGORIES = ["klanten", "clients"];

const pinRank = (label: string) => {
  const i = PINNED_CATEGORIES.indexOf(label.toLocaleLowerCase("nl"));
  return i === -1 ? PINNED_CATEGORIES.length : i;
};

export interface WorkspaceGroup<W> {
  /** Display label of the category (first spelling seen); null = workspaces without a category (or the favorites group). */
  category: string | null;
  /** True for the group of workspaces the user starred; it always comes first. */
  favorite?: boolean;
  workspaces: W[];
}

type Groupable = { id?: string; name?: string; category?: string | null };

const byName = (a: Groupable, b: Groupable) => (a.name ?? "").localeCompare(b.name ?? "", "nl", { sensitivity: "base", numeric: true });

/**
 * Groups workspaces for the switcher. Starred workspaces (`favoriteIds`) form
 * their own group at the top and are left out of their category. The other
 * workspaces are grouped by category, matched case-insensitively: pinned
 * categories ("Klanten"/"Clients") first, the others alphabetically, and
 * workspaces without a category last. Within every group workspaces are
 * sorted alphabetically by name.
 */
export function groupWorkspaces<W extends Groupable>(list: W[], favoriteIds: Iterable<string> = []): WorkspaceGroup<W>[] {
  const favIds = new Set(favoriteIds);
  const favs: W[] = [];
  const groups = new Map<string, WorkspaceGroup<W>>();
  const rest: W[] = [];
  for (const w of list) {
    if (w.id && favIds.has(w.id)) { favs.push(w); continue; }
    const label = w.category?.trim();
    if (!label) { rest.push(w); continue; }
    const key = label.toLocaleLowerCase("nl");
    const g = groups.get(key);
    if (g) g.workspaces.push(w);
    else groups.set(key, { category: label, workspaces: [w] });
  }
  const sorted = [...groups.values()].sort((a, b) =>
    pinRank(a.category!) - pinRank(b.category!) || a.category!.localeCompare(b.category!, "nl", { sensitivity: "base" }));
  const all = [
    ...(favs.length ? [{ category: null, favorite: true, workspaces: favs }] : []),
    ...sorted,
    ...(rest.length ? [{ category: null, workspaces: rest }] : []),
  ];
  for (const g of all) g.workspaces.sort(byName);
  return all;
}

/** Distinct category labels, sorted, for suggestions in the edit dialog. */
export function workspaceCategories(list: { category?: string | null }[]): string[] {
  return groupWorkspaces(list).flatMap((g) => (g.category ? [g.category] : []));
}

/**
 * Test fixture (npm run db:seed, unit tests via freshCtx, e2e reset): one account with role-named users and
 * placeholder workspaces. Not offered to end users: `npm run setup` always starts blank.
 */
export const ACCOUNT = { name: "Example", slug: "example" };

export interface SeedUser { key: string; name: string; email: string; title: string; role: "admin" | "member"; isAiAgent?: boolean; teams: string[] }

/**
 * 12 test users, e-mail <key>@example.com.
 */
export const USERS: SeedUser[] = [
  { key: "admin", name: "Admin User", email: "admin@example.com", title: "Projectmanager", role: "admin", teams: ["Projectmanagement", "Consultancy"] },
  { key: "owner", name: "Owner User", email: "owner@example.com", title: "Eigenaar", role: "admin", teams: ["DEV"] },
  { key: "pm1", name: "Planner", email: "pm1@example.com", title: "Projectmanager", role: "member", teams: ["Projectmanagement"] },
  { key: "pm2", name: "Coordinator", email: "pm2@example.com", title: "Projectmanager", role: "member", teams: ["Projectmanagement"] },
  { key: "dev1", name: "Builder", email: "dev1@example.com", title: "Developer", role: "member", teams: ["DEV"] },
  { key: "dev2", name: "Reviewer", email: "dev2@example.com", title: "Developer", role: "member", teams: ["DEV"] },
  { key: "develop", name: "Develop", email: "develop@example.com", title: "Developer (shared account)", role: "member", teams: ["DEV"] },
  { key: "consultant1", name: "Consultant Een", email: "consultant1@example.com", title: "Consultant", role: "member", teams: ["Consultancy"] },
  { key: "consultant2", name: "Consultant Twee", email: "consultant2@example.com", title: "Consultant", role: "member", teams: ["Consultancy"] },
  { key: "developer3", name: "Developer Drie", email: "developer3@example.com", title: "Developer", role: "member", teams: ["DEV"] },
  { key: "agent1", name: "Scout", email: "agent1@example.com", title: "AI-agent", role: "member", isAiAgent: true, teams: ["DEV"] },
  { key: "agent2", name: "Aide", email: "agent2@example.com", title: "AI-agent", role: "member", isAiAgent: true, teams: ["Consultancy"] },
];

export const TEAMS = ["DEV", "Consultancy", "Projectmanagement"];

export const WORKSPACES: { name: string; color: string; folders: string[] }[] = [
  { name: "Example", color: "#0073ea", folders: ["Employee", "Strategy", "Team views", "Documents"] },
  { name: "TEMPLATE — Klant Workspace", color: "#ffcb00", folders: ["AI Maturity Tracker", "Klant informatie", "Planning & To do's"] },
  { name: "Alpha", color: "#00c875", folders: ["Klantinformatie", "Documents"] },
  { name: "Bravo", color: "#a25ddc", folders: [] },
  { name: "Charlie", color: "#ff158a", folders: [] },
  { name: "Delivery", color: "#fdab3d", folders: ["Documenten"] },
  { name: "Internal projects", color: "#579bfc", folders: ["Project Management", "High Level", "Projects"] },
  { name: "Support", color: "#66ccff", folders: [] },
  { name: "Sales & Tenders", color: "#df2f4a", folders: [] },
  { name: "Intern", color: "#7f5347", folders: [] },
];

export const L = (id: number, text: string, color: string, isDone = false) => ({ id, text, color, index: id, isDone });
export const GREY = "#c4c4c4";
export const KLANTEN_STATUS = [L(0, "Working on it", "#fdab3d"), L(1, "Done", "#00c875", true), L(2, "Stuck", "#df2f4a"), L(5, "", GREY)];
export const FASE_STATUS = [
  L(0, "Gepland", GREY), L(1, "Actief", "#0073ea"), L(2, "In review", "#a25ddc"), L(3, "Go/no-go", "#fdab3d"), L(4, "Afgerond", "#00c875", true), L(5, "Geparkeerd", "#757575"),
];
export const RISICO_STATUS = [L(0, "Groen", "#00c875"), L(1, "Oranje", "#fdab3d"), L(2, "Rood", "#df2f4a")];
export const GONOGO_STATUS = [L(0, "Open", GREY), L(1, "Go", "#00c875", true), L(2, "No-go", "#df2f4a")];

import "./_env";
import { resetAndSeed } from "../src/db/reset";

resetAndSeed().then((r) => {
  console.log(`Database reset + seeded (${process.env.DATABASE_URL || "file:data/app.db"}): ${Object.keys(r.userIds).length} users, ${Object.keys(r.workspaceIds).length} workspaces`);
}).catch((e) => { console.error(e); process.exit(1); });

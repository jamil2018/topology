/**
 * Apply journaled Drizzle migrations under drizzle/ (see drizzle/meta/_journal.json).
 */
import { config } from "dotenv";
import { runMigrations } from "./migrator";

if (process.env.TOPOLOGY_VALIDATION !== "1") {
  config({ path: ".env.local", quiet: true });
  config({ path: ".env", quiet: true });
}

runMigrations()
  .then(() => {
    console.log("Migrations applied.");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

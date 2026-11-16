import { afterAll } from "vitest";
import { leaseDatabase } from "../../scripts/validation/database";

// Every integration file starts from the same pristine seed, independently of
// collection order. Non-harness invocation is refused instead of touching dev DB.
const lease = await leaseDatabase();
const previous = process.env.DATABASE_URL;
process.env.DATABASE_URL = lease.url;
const globalDb = globalThis as typeof globalThis & { postgresClient?: { end: (options?: { timeout: number }) => Promise<void> } };
delete globalDb.postgresClient;
afterAll(async () => {
  try { await globalDb.postgresClient?.end({ timeout: 5 }); }
  finally {
    delete globalDb.postgresClient;
    process.env.DATABASE_URL = previous;
    await lease.close();
  }
});

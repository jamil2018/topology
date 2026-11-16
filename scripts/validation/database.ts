import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { assertOwnedDatabase } from "./safety";

/** Creates a lease only from the harness-owned pristine template. */
export async function leaseDatabase() {
  const adminUrl = process.env.TOPOLOGY_VALIDATION_ADMIN_URL;
  const template = process.env.TOPOLOGY_VALIDATION_TEMPLATE;
  const owner = process.env.TOPOLOGY_VALIDATION_OWNER;
  if (process.env.TOPOLOGY_VALIDATION !== "1" || !adminUrl || !template || !owner ||
      !/^[a-f0-9]{16}$/.test(owner) || template !== `topology_validation_${owner}_browser_template`) {
    throw new Error("Database isolation requires the disposable harness template");
  }
  const admin = postgres(adminUrl, { max: 1 });
  const name = `topology_validation_${owner}_case_${randomBytes(8).toString("hex")}`;
  const created = new Set<string>();
  try {
    await admin.unsafe(`CREATE DATABASE "${name}" WITH TEMPLATE "${template}"`);
    created.add(name);
  } catch (error) { await admin.end(); throw error; }
  const url = new URL(adminUrl); url.pathname = `/${name}`;
  return {
    url: url.toString(),
    async close() {
      try {
        assertOwnedDatabase(name, created);
        await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      } finally { await admin.end(); }
    },
  };
}

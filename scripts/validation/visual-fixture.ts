import postgres from "postgres";
import { assertOwnedDatabase } from "./safety";

export async function prepareVisualIdentity(url: string, created: ReadonlySet<string>) {
  assertOwnedDatabase(new URL(url).pathname.slice(1), created);
  const sql = postgres(url, { max: 1 });
  try {
    const owner = new URL(url).pathname.match(/^\/topology_validation_([a-f0-9]{16})_visual$/)?.[1];
    if (!owner) throw new Error("Unexpected visual database name");
    await sql`CREATE TABLE validation_harness_owner (id text PRIMARY KEY)`;
    await sql`INSERT INTO validation_harness_owner (id) VALUES (${owner})`;
    await sql`CREATE SEQUENCE validation_visual_ids`;
    await sql.unsafe(`CREATE FUNCTION validation_visual_uuid() RETURNS uuid LANGUAGE SQL VOLATILE AS
      $$ SELECT ('10000000-0000-4000-8000-' || lpad(nextval('validation_visual_ids')::text, 12, '0'))::uuid $$`);
    const columns = await sql`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type = 'uuid' AND column_default = 'gen_random_uuid()'`;
    for (const column of columns) {
      await sql`ALTER TABLE ${sql(column.table_name)} ALTER COLUMN ${sql(column.column_name)} SET DEFAULT validation_visual_uuid()`;
    }
  } finally { await sql.end(); }
}

export async function normalizeVisualDates(url: string, created: ReadonlySet<string>) {
  assertOwnedDatabase(new URL(url).pathname.slice(1), created);
  const sql = postgres(url, { max: 1 });
  try {
    const columns = await sql`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND data_type IN ('timestamp without time zone', 'timestamp with time zone')`;
    for (const column of columns) {
      const table = sql(column.table_name), field = sql(column.column_name);
      await sql`UPDATE ${table} SET ${field} = timestamp '2026-01-02 12:00:00' +
        (date_trunc('day', ${field}) - date_trunc('day', current_timestamp)) WHERE ${field} IS NOT NULL`;
    }
    // Lists sort by updatedAt and UUID. Give each seeded run a stable rank so
    // random fixture IDs never decide the visual row order.
    await sql`UPDATE cases SET title = 'Checkout presentation with a deliberately long title covering payment validation, retry feedback, shipping addresses, keyboard access and recovery when the connection is interrupted during submission'
      WHERE key = 'HAR-1'`;
    await sql`WITH ordered AS (SELECT id, row_number() OVER (PARTITION BY workspace_id ORDER BY name) AS rank FROM runs)
      UPDATE runs SET updated_at = timestamp '2026-01-02 12:00:00' + ordered.rank * interval '1 hour'
      FROM ordered WHERE runs.id = ordered.id`;
  } finally { await sql.end(); }
}

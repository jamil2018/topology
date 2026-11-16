import postgres from "postgres";

/** Fault injection can mutate only a database bearing this invocation's marker. */
export async function ownedDatabase() {
  const url = process.env.DATABASE_URL;
  const owner = process.env.TOPOLOGY_VALIDATION_OWNER;
  if (process.env.TOPOLOGY_VALIDATION !== "1" || !url || !owner ||
      !new RegExp(`^/topology_validation_${owner}_(seeded|visual|case_[a-f0-9]{16})$`).test(new URL(url).pathname)) {
    throw new Error("Database fault injection requires the disposable validation harness");
  }
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql`SELECT id FROM validation_harness_owner`;
    if (rows.length !== 1 || rows[0].id !== owner) throw new Error("Database is not owned by this validation invocation");
    return sql;
  } catch (error) { await sql.end(); throw error; }
}

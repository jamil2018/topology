import { count } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function countUsers(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(users);
  return Number(row?.value ?? 0);
}

export async function needsFirstRunSetup(): Promise<boolean> {
  return (await countUsers()) === 0;
}

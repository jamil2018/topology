export type SeedEnv = {
  NODE_ENV?: string;
  TOPOLOGY_ALLOW_DEMO_SEED?: string;
  TOPOLOGY_SEED_MODE?: string;
};

export function assertDemoSeedAllowed(env: SeedEnv = process.env): void {
  if (
    env.NODE_ENV === "production" &&
    env.TOPOLOGY_ALLOW_DEMO_SEED !== "1"
  ) {
    throw new Error(
      "Refusing to run db:seed in production. Set TOPOLOGY_ALLOW_DEMO_SEED=1 to override.",
    );
  }
}

/** Default is demo data. `bootstrap` creates only the first admin + API token. */
export function seedIncludesDemoData(env: SeedEnv = process.env): boolean {
  return env.TOPOLOGY_SEED_MODE !== "bootstrap";
}

/**
 * `e2e` adds role users, extra projects, and scoped tokens on top of the demo
 * seed. Unset mode does not. Demo data still runs (`e2e` is not `bootstrap`).
 */
export function seedIncludesE2eData(env: SeedEnv = process.env): boolean {
  return env.TOPOLOGY_SEED_MODE === "e2e";
}

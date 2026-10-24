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

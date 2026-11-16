import { config } from "dotenv";
import path from "node:path";

if (process.env.TOPOLOGY_VALIDATION !== "1") {
  config({ path: path.resolve(process.cwd(), ".env.local"), quiet: true });
  config({ path: path.resolve(process.cwd(), ".env"), quiet: true });
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://topology:topology@127.0.0.1:54329/topology";
}
if (!process.env.TOPOLOGY_API_TOKEN) {
  process.env.TOPOLOGY_API_TOKEN = "topo_demo_token_local_dev_only";
}
if (!process.env.DEMO_USER_EMAIL) {
  process.env.DEMO_USER_EMAIL = "demo@topology.local";
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "topology-test-secret-not-for-production";
}
process.env.TOPOLOGY_ISSUE_PROVIDER ??= "mock";

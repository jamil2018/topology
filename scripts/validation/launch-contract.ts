import { z } from "zod";

const text = z.string().trim().min(1);
export const signatures = ["Engineering", "QA", "UX/accessibility", "Integrations", "Operations", "Release owner"] as const;
export const integrations = {
  "auth-github": "GitHub OAuth callback",
  "auth-google": "Google OAuth callback",
  "auth-oidc": "OIDC callback",
  "issues-github": "GitHub issue operations",
  "issues-gitlab": "GitLab issue operations",
  "issues-jira": "Jira issue operations and configured callbacks",
  "issues-linear": "Linear issue operations",
  "issues-mock": "Mock issue operations",
  "vendor-testrail": "TestRail case API and historical bundle",
  "vendor-qase": "Qase case API and historical bundle",
  "vendor-zephyr": "Zephyr case API and file import",
  "vendor-xray": "Xray file import",
  "runner-github": "GitHub Actions dispatch and evidence delivery",
  "runner-gitlab": "GitLab CI dispatch and evidence delivery",
  "jira-requirements": "Signed Jira requirement revisions",
  "webhooks": "Outbound webhook delivery",
  "notifications-slack": "Slack notifications",
  "notifications-teams": "Teams notifications",
  "notifications-smtp": "SMTP notifications",
  "attachments-local": "Local attachment volume",
  "attachments-s3": "S3-compatible attachment storage",
  "protocol-http": "Public API, JUnit, execution protocol and SSE",
  "client-cli": "Standalone CLI",
  "client-mcp": "Standalone MCP",
  "client-codex": "Codex MCP session",
  "client-claude": "Claude Code MCP session",
  "client-playwright": "Playwright reporter",
  "client-jest": "Jest reporter",
  "client-cypress": "Cypress reporter",
  "client-pytest": "pytest plugin",
  "ai-openai": "OpenAI hosted AI",
  "ai-azure": "Azure OpenAI",
  "ai-anthropic": "Anthropic",
  "ai-compatible": "Compatible self-hosted AI",
} as const;

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const timestamp = z.string().datetime({ offset: true });
const proof = z.array(text).min(1);
export const outcome = z.enum(["PASS", "FAIL", "BLOCKED", "NOT RUN", "N/A"]);

export const rowSchema = z.object({
  status: outcome,
  commit: sha.optional(),
  imageDigest: digest.optional(),
  environment: z.enum(["harness", "staging", "ci", "consumer", "manual"]).optional(),
  tester: text.optional(),
  observedAt: timestamp.optional(),
  evidence: proof.optional(),
  reason: text.optional(),
  defect: text.optional(),
  exception: z.object({
    impact: text, workaround: text, owner: text, expiresAt: timestamp, acceptedBy: text,
  }).optional(),
});

const connection = z.object({
  enabled: z.boolean().nullable(), promised: z.boolean().nullable(),
  sandbox: text.optional(), owner: text.optional(), deliveryModes: z.array(text).min(1).optional(),
});
const attest = z.object({ signer: text, signedAt: timestamp, evidence: proof });
export const candidateSchema = z.object({
  commit: sha, inventoryDigest: digest, journalDigest: digest,
  imageDigest: digest.nullable(),
  composeDigest: digest.nullable(),
  proxyDigest: digest.nullable(),
  stagingOrigin: z.string().url().refine((value) => value.startsWith("https://")).nullable(),
  browsers: z.array(text).min(1),
  packages: z.record(z.string(), z.object({ version: text, digest, artifact: text })),
  integrations: z.record(z.string(), connection),
  signatures: z.partialRecord(z.enum(signatures), attest),
});

export const packageNames = [
  "@topology/domain", "@topology/cli", "@topology/mcp", "@topology/playwright", "@topology/jest",
  "@topology/cypress", "pytest-topology",
] as const;
export type Candidate = z.infer<typeof candidateSchema>;
export type LedgerRow = z.infer<typeof rowSchema>;

export function qualificationIssue(row: LedgerRow, options: { priority: string; allowNA: boolean; commit: string; stagingDigest?: string; stagingRequired?: boolean; releaseOwner?: string; now: number }) {
  if (row.status === "BLOCKED" || row.status === "NOT RUN") return row.status;
  if (!row.tester || !row.observedAt) return "tester and timestamp required";
  if (Date.parse(row.observedAt) > options.now) return "test timestamp is in the future";
  if (row.commit !== options.commit) return "receipt SHA must match the candidate";
  if (row.status === "N/A") return options.allowNA && row.reason ? undefined : "N/A requires a justified conditional check";
  if (!row.environment) return "environment required";
  if ((row.environment === "staging" || options.stagingRequired) &&
      (row.environment !== "staging" || !options.stagingDigest || row.imageDigest !== options.stagingDigest)) {
    return "staging receipt must match the candidate image digest";
  }
  if (!row.evidence?.length) return "evidence required";
  if (row.status === "PASS") return;
  if (!row.defect) return "defect required";
  if (options.priority === "P2" && row.reason) return;
  if (options.priority === "P1" && row.exception?.acceptedBy === options.releaseOwner &&
      row.exception && Date.parse(row.exception.expiresAt) > options.now) return;
  return "unresolved failure";
}

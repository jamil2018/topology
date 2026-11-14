import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  dedupeNormalizedResults,
  normalizeJUnitCases,
  parseJUnitXml,
} from "@topology/domain";

const hasDb = Boolean(process.env.DATABASE_URL);
const fixtures = path.resolve(process.cwd(), "fixtures/junit");

/** Same normalization the CLI uses before POST /api/ci/junit. */
function cliResultsFromXml(raw: string) {
  return dedupeNormalizedResults(
    normalizeJUnitCases(parseJUnitXml(raw).cases),
  );
}

describe.skipIf(!hasDb)("CLI junit submit (integration)", () => {
  beforeAll(() => {
    process.env.TOPOLOGY_API_TOKEN ??= "topo_demo_token_local_dev_only";
    process.env.DEMO_USER_EMAIL ??= "demo@topology.local";
    process.env.TOPOLOGY_ISSUE_PROVIDER = "mock";
  });

  async function postJunit(
    token: string | null,
    body: string,
  ): Promise<Response> {
    const { POST } = await import("@/app/api/ci/junit/route");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return POST(
      new Request("http://127.0.0.1/api/ci/junit", {
        method: "POST",
        headers,
        body,
      }),
    );
  }

  it("rejects a bad bearer token", async () => {
    const res = await postJunit(
      "not-a-real-token",
      JSON.stringify({
        name: "bad token",
        source: "cli",
        results: [
          {
            externalKey: "hub::loads",
            classname: "hub",
            name: "loads",
            status: "passed",
            notes: "",
            durationMs: 1,
          },
        ],
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects an empty junit file and a file with no test cases", async () => {
    for (const raw of ["", "<not-junit><note>no cases</note></not-junit>"]) {
      const results = cliResultsFromXml(raw);
      expect(results).toEqual([]);
      const res = await postJunit(
        process.env.TOPOLOGY_API_TOKEN!,
        JSON.stringify({
          name: `empty junit ${Date.now()}`,
          source: "cli",
          results,
        }),
      );
      expect(res.status).toBe(400);
    }
  });

  it("rejects a raw XML body", async () => {
    const raw = await readFile(path.join(fixtures, "smoke.xml"), "utf8");
    const res = await postJunit(process.env.TOPOLOGY_API_TOKEN!, raw);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toMatch(/Invalid JSON/i);
  });

  it("accepts fixtures/junit/smoke.xml and false-green.xml", async () => {
    const smoke = cliResultsFromXml(
      await readFile(path.join(fixtures, "smoke.xml"), "utf8"),
    );
    const smokeRes = await postJunit(
      process.env.TOPOLOGY_API_TOKEN!,
      JSON.stringify({
        name: `CLI smoke ${Date.now()}`,
        source: "cli",
        results: smoke,
      }),
    );
    expect(smokeRes.status).toBe(200);
    const smokeBody = (await smokeRes.json()) as {
      run: { id: string };
      summary: { passed: number; failed: number; total: number };
    };
    expect(smokeBody.run.id).toBeTruthy();
    expect(smokeBody.summary).toMatchObject({
      total: 3,
      passed: 2,
      failed: 1,
    });

    const falseGreen = cliResultsFromXml(
      await readFile(path.join(fixtures, "false-green.xml"), "utf8"),
    );
    const falseGreenRes = await postJunit(
      process.env.TOPOLOGY_API_TOKEN!,
      JSON.stringify({
        name: `CLI false-green ${Date.now()}`,
        source: "cli",
        results: falseGreen,
      }),
    );
    expect(falseGreenRes.status).toBe(200);
    const falseGreenBody = (await falseGreenRes.json()) as {
      summary: { passed: number; failed: number; total: number };
    };
    expect(falseGreenBody.summary).toMatchObject({
      total: 3,
      passed: 1,
      failed: 2,
    });
  });
});

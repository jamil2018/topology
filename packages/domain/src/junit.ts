export type JUnitTestCase = {
  classname: string;
  name: string;
  timeSeconds: number;
  status: "passed" | "failed" | "error" | "skipped";
  message: string;
  systemOut: string;
};

export type JUnitSuite = {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  timeSeconds: number;
  cases: JUnitTestCase[];
};

export type JUnitReport = {
  suites: JUnitSuite[];
  cases: JUnitTestCase[];
};

export type NormalizedResult = {
  externalKey: string;
  classname: string;
  name: string;
  status: "passed" | "failed" | "skipped" | "blocked" | "untested";
  notes: string;
  durationMs: number;
};

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : "";
}

function numberAttr(tag: string, name: string, fallback = 0): number {
  const raw = attr(tag, name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function innerText(block: string, tagName: string): string {
  const re = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "i",
  );
  const match = block.match(re);
  return match ? decodeXml(match[1].trim()) : "";
}

function parseTestCase(block: string): JUnitTestCase {
  const open = block.match(/^<testcase\b[^>]*>/i)?.[0] ?? "<testcase>";
  const classname = attr(open, "classname");
  const name = attr(open, "name");
  const timeSeconds = numberAttr(open, "time");

  let status: JUnitTestCase["status"] = "passed";
  let message = "";

  if (/<skipped\b/i.test(block)) {
    status = "skipped";
    message = attr(block.match(/<skipped\b[^>]*\/?>/i)?.[0] ?? "", "message");
  } else if (/<failure\b/i.test(block)) {
    status = "failed";
    const failTag = block.match(/<failure\b[^>]*>/i)?.[0] ?? "";
    message = attr(failTag, "message") || innerText(block, "failure");
  } else if (/<error\b/i.test(block)) {
    status = "error";
    const errTag = block.match(/<error\b[^>]*>/i)?.[0] ?? "";
    message = attr(errTag, "message") || innerText(block, "error");
  }

  const systemOut = innerText(block, "system-out");

  return {
    classname,
    name,
    timeSeconds,
    status,
    message,
    systemOut,
  };
}

function parseSuite(block: string): JUnitSuite {
  const open = block.match(/^<testsuite\b[^>]*>/i)?.[0] ?? "<testsuite>";
  const caseBlocks =
    block.match(/<testcase\b[^>]*\/>|<testcase\b[\s\S]*?<\/testcase>/gi) ?? [];
  const cases = caseBlocks.map(parseTestCase);

  return {
    name: attr(open, "name") || "suite",
    tests: numberAttr(open, "tests", cases.length),
    failures: numberAttr(
      open,
      "failures",
      cases.filter((c) => c.status === "failed").length,
    ),
    errors: numberAttr(
      open,
      "errors",
      cases.filter((c) => c.status === "error").length,
    ),
    skipped: numberAttr(
      open,
      "skipped",
      cases.filter((c) => c.status === "skipped").length,
    ),
    timeSeconds: numberAttr(open, "time"),
    cases,
  };
}

/** Parse a JUnit XML document (single suite, testsuites, or shard fragment). */
export function parseJUnitXml(raw: string): JUnitReport {
  const xml = raw.replace(/^\uFEFF/, "").trim();
  if (!xml) {
    return { suites: [], cases: [] };
  }

  const suiteBlocks =
    xml.match(/<testsuite\b[^>]*\/>|<testsuite\b[\s\S]*?<\/testsuite>/gi) ?? [];

  if (suiteBlocks.length === 0) {
    const caseBlocks =
      xml.match(/<testcase\b[^>]*\/>|<testcase\b[\s\S]*?<\/testcase>/gi) ?? [];
    const cases = caseBlocks.map(parseTestCase);
    return {
      suites: [
        {
          name: "imported",
          tests: cases.length,
          failures: cases.filter((c) => c.status === "failed").length,
          errors: cases.filter((c) => c.status === "error").length,
          skipped: cases.filter((c) => c.status === "skipped").length,
          timeSeconds: cases.reduce((sum, c) => sum + c.timeSeconds, 0),
          cases,
        },
      ],
      cases,
    };
  }

  const suites = suiteBlocks.map(parseSuite);
  return {
    suites,
    cases: suites.flatMap((s) => s.cases),
  };
}

export function externalKeyForCase(testcase: {
  classname: string;
  name: string;
}): string {
  const cls = testcase.classname.trim();
  const name = testcase.name.trim();
  if (cls && name) return `${cls}::${name}`;
  return name || cls || "unknown";
}

export function normalizeJUnitCases(cases: JUnitTestCase[]): NormalizedResult[] {
  return cases.map((c) => {
    const status: NormalizedResult["status"] =
      c.status === "error"
        ? "failed"
        : c.status === "failed"
          ? "failed"
          : c.status === "skipped"
            ? "skipped"
            : "passed";

    const notes = [c.message, c.systemOut].filter(Boolean).join("\n").trim();

    return {
      externalKey: externalKeyForCase(c),
      classname: c.classname,
      name: c.name,
      status,
      notes,
      durationMs: Math.round(c.timeSeconds * 1000),
    };
  });
}

/** Merge shard result sets by externalKey; later shards overwrite earlier ones. */
export function mergeShardResults(
  shards: NormalizedResult[][],
): NormalizedResult[] {
  const map = new Map<string, NormalizedResult>();
  for (const shard of shards) {
    for (const result of shard) {
      map.set(result.externalKey, result);
    }
  }
  return [...map.values()].sort((a, b) =>
    a.externalKey.localeCompare(b.externalKey),
  );
}

export function summarizeResults(results: NormalizedResult[]): {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number | null;
} {
  const total = results.length;
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const executed = passed + failed;
  return {
    total,
    passed,
    failed,
    skipped,
    passRate: executed === 0 ? null : Math.round((passed / executed) * 100),
  };
}

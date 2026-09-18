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

type XmlText = { type: "text"; value: string };
type XmlElement = {
  type: "element";
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
};
type XmlNode = XmlText | XmlElement;

const MAX_XML_NODES = 100_000;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function numberFrom(raw: string | undefined, fallback = 0): number {
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function skipSpace(xml: string, i: number): number {
  while (i < xml.length && /\s/.test(xml[i]!)) i += 1;
  return i;
}

function readName(xml: string, i: number): { name: string; next: number } | null {
  if (i >= xml.length || !/[A-Za-z_:]/.test(xml[i]!)) return null;
  const start = i;
  i += 1;
  while (i < xml.length && /[\w:.-]/.test(xml[i]!)) i += 1;
  return { name: xml.slice(start, i), next: i };
}

function readQuoted(xml: string, i: number, quote: string): { value: string; next: number } | null {
  const end = xml.indexOf(quote, i);
  if (end === -1) return null;
  return { value: xml.slice(i, end), next: end + 1 };
}

/**
 * Nesting walker. Text, comments, and CDATA are not markup, so a literal
 * `</testcase>` inside `<system-out>` does not close the case. A close tag
 * only pops the element it names.
 */
function parseXmlNodes(xml: string): XmlNode[] {
  const root: XmlNode[] = [];
  const stack: XmlElement[] = [
    { type: "element", name: "#root", attrs: {}, children: root },
  ];
  let i = 0;
  let nodes = 0;

  const pushText = (value: string, decode: boolean) => {
    if (!value) return;
    const current = stack[stack.length - 1];
    if (!current || nodes >= MAX_XML_NODES) return;
    nodes += 1;
    current.children.push({
      type: "text",
      value: decode ? decodeXml(value) : value,
    });
  };

  while (i < xml.length && nodes < MAX_XML_NODES) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) {
      pushText(xml.slice(i), true);
      break;
    }
    if (lt > i) pushText(xml.slice(i, lt), true);

    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      i = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      if (end === -1) {
        pushText(xml.slice(lt + 9), false);
        break;
      }
      pushText(xml.slice(lt + 9, end), false);
      i = end + 3;
      continue;
    }
    if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt + 2);
      i = end === -1 ? xml.length : end + 2;
      continue;
    }
    if (xml.startsWith("<!", lt)) {
      const end = xml.indexOf(">", lt + 2);
      i = end === -1 ? xml.length : end + 1;
      continue;
    }

    const isEnd = xml.startsWith("</", lt);
    const nameAt = lt + (isEnd ? 2 : 1);
    const named = readName(xml, nameAt);
    if (!named) {
      pushText("<", false);
      i = lt + 1;
      continue;
    }

    if (isEnd) {
      const close = xml.indexOf(">", named.next);
      if (close === -1) break;
      const name = named.name.toLowerCase();
      const current = stack[stack.length - 1];
      if (current && current.name === name && stack.length > 1) {
        stack.pop();
      } else {
        pushText(xml.slice(lt, close + 1), false);
      }
      i = close + 1;
      continue;
    }

    let cursor = skipSpace(xml, named.next);
    const attrs: Record<string, string> = {};
    let selfClosing = false;
    let closed = false;
    while (cursor < xml.length) {
      cursor = skipSpace(xml, cursor);
      if (cursor >= xml.length) break;
      if (xml.startsWith("/>", cursor)) {
        selfClosing = true;
        closed = true;
        cursor += 2;
        break;
      }
      if (xml[cursor] === ">") {
        closed = true;
        cursor += 1;
        break;
      }
      const attr = readName(xml, cursor);
      if (!attr) {
        cursor += 1;
        continue;
      }
      cursor = skipSpace(xml, attr.next);
      if (xml[cursor] !== "=") {
        attrs[attr.name] = "";
        continue;
      }
      cursor = skipSpace(xml, cursor + 1);
      const quote = xml[cursor];
      if (quote === '"' || quote === "'") {
        const quoted = readQuoted(xml, cursor + 1, quote);
        if (!quoted) {
          cursor = xml.length;
          break;
        }
        attrs[attr.name] = decodeXml(quoted.value);
        cursor = quoted.next;
      } else {
        const start = cursor;
        while (cursor < xml.length && !/[\s/>]/.test(xml[cursor]!)) cursor += 1;
        attrs[attr.name] = decodeXml(xml.slice(start, cursor));
      }
    }

    if (!closed) break;

    const element: XmlElement = {
      type: "element",
      name: named.name.toLowerCase(),
      attrs,
      children: [],
    };
    const current = stack[stack.length - 1];
    if (current && nodes < MAX_XML_NODES) {
      nodes += 1;
      current.children.push(element);
    }
    if (!selfClosing) stack.push(element);
    i = cursor;
  }

  return root;
}

function elementText(node: XmlElement): string {
  let out = "";
  for (const child of node.children) {
    if (child.type === "text") out += child.value;
    else out += elementText(child);
  }
  return out.trim();
}

function directElements(node: XmlElement): XmlElement[] {
  return node.children.filter((child): child is XmlElement => child.type === "element");
}

function caseFrom(node: XmlElement): JUnitTestCase {
  const classname = node.attrs.classname ?? "";
  const name = node.attrs.name ?? "";
  const timeSeconds = numberFrom(node.attrs.time);
  const children = directElements(node);
  const failure = children.find((child) => child.name === "failure");
  const error = children.find((child) => child.name === "error");
  const skipped = children.find((child) => child.name === "skipped");

  let status: JUnitTestCase["status"] = "passed";
  let message = "";
  if (failure) {
    status = "failed";
    message = failure.attrs.message || elementText(failure);
  } else if (error) {
    status = "error";
    message = error.attrs.message || elementText(error);
  } else if (skipped) {
    status = "skipped";
    message = skipped.attrs.message || elementText(skipped);
  }

  const systemOut = children
    .filter((child) => child.name === "system-out" || child.name === "system-err")
    .map(elementText)
    .filter(Boolean)
    .join("\n");

  return {
    classname,
    name,
    timeSeconds,
    status,
    message,
    systemOut,
  };
}

function suiteFrom(node: XmlElement): JUnitSuite {
  const cases = directElements(node)
    .filter((child) => child.name === "testcase")
    .map(caseFrom);

  return {
    name: node.attrs.name || "suite",
    tests: node.attrs.tests ? numberFrom(node.attrs.tests) : cases.length,
    failures: node.attrs.failures
      ? numberFrom(node.attrs.failures)
      : cases.filter((c) => c.status === "failed").length,
    errors: node.attrs.errors
      ? numberFrom(node.attrs.errors)
      : cases.filter((c) => c.status === "error").length,
    skipped: node.attrs.skipped
      ? numberFrom(node.attrs.skipped)
      : cases.filter((c) => c.status === "skipped").length,
    timeSeconds: numberFrom(node.attrs.time),
    cases,
  };
}

function collectSuites(nodes: XmlNode[], into: JUnitSuite[]) {
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (node.name === "testsuite") {
      into.push(suiteFrom(node));
      collectSuites(node.children, into);
    } else if (node.name === "testsuites") {
      collectSuites(node.children, into);
    }
  }
}

function collectLooseCases(nodes: XmlNode[]): JUnitTestCase[] {
  const cases: JUnitTestCase[] = [];
  for (const node of nodes) {
    if (node.type !== "element") continue;
    if (node.name === "testcase") cases.push(caseFrom(node));
    else if (node.name === "testsuites") cases.push(...collectLooseCases(node.children));
  }
  return cases;
}

/** Parse a JUnit XML document (single suite, testsuites, or shard fragment). */
export function parseJUnitXml(raw: string): JUnitReport {
  const xml = raw.replace(/^\uFEFF/, "").trim();
  if (!xml) {
    return { suites: [], cases: [] };
  }

  const nodes = parseXmlNodes(xml);
  const suites: JUnitSuite[] = [];
  collectSuites(nodes, suites);

  if (suites.length === 0) {
    const cases = collectLooseCases(nodes);
    if (cases.length === 0) return { suites: [], cases: [] };
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

  return {
    suites,
    cases: suites.flatMap((suite) => suite.cases),
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

/** Collapse copies of one external key. A later pass cannot hide a failure. */
export function dedupeNormalizedResults(
  results: NormalizedResult[],
): NormalizedResult[] {
  const map = new Map<string, NormalizedResult>();
  for (const result of results) {
    const prior = map.get(result.externalKey);
    if (!prior || prior.status !== "failed" || result.status === "failed") {
      map.set(result.externalKey, result);
    }
  }
  return [...map.values()];
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

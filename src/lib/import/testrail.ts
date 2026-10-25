import { parseCsvTable } from "@/lib/csv";
import { suggestMapping } from "./mapping";
import { formatSteps, uniqueFields } from "./steps";
import type { ImportParseResult, SourceTable } from "./types";
import {
  parseXml,
  xmlChild,
  xmlElements,
  xmlText,
  type XmlElement,
} from "./xml";

function sniff(raw: string): "xml" | "json" | "csv" {
  const trimmed = raw.trim();
  if (trimmed.startsWith("<")) return "xml";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  return "csv";
}

function caseKey(id: string): string {
  const trimmed = id.trim();
  if (!trimmed) return "";
  if (/^c\d+$/i.test(trimmed)) return `C${trimmed.slice(1)}`;
  if (/^\d+$/.test(trimmed)) return `C${trimmed}`;
  return trimmed;
}

function flattenCase(
  node: XmlElement,
  folder: string,
): Record<string, string> {
  const custom = xmlChild(node, "custom");
  const stepsRoot =
    xmlChild(custom ?? node, "steps_separated") ??
    xmlChild(custom ?? node, "stepsseparated");
  const stepNodes = stepsRoot ? xmlElements(stepsRoot, "step") : [];
  const formatted = formatSteps(
    stepNodes.map((step) => ({
      action: xmlText(xmlChild(step, "content") ?? xmlChild(step, "step")),
      expected: xmlText(
        xmlChild(step, "expected") ?? xmlChild(step, "expectedresult"),
      ),
    })),
  );
  const textSteps = xmlText(xmlChild(custom ?? node, "steps"));
  const tags = [
    xmlText(xmlChild(node, "references")),
    xmlText(xmlChild(node, "refs")),
  ]
    .filter(Boolean)
    .join(";");

  return {
    id: caseKey(
      xmlText(xmlChild(node, "id")) || node.attrs.id || node.attrs.caseid || "",
    ),
    title: xmlText(xmlChild(node, "title") ?? xmlChild(node, "name")),
    description: xmlText(
      xmlChild(node, "description") ?? xmlChild(custom, "description"),
    ),
    preconditions: xmlText(
      xmlChild(custom, "preconds") ??
        xmlChild(custom, "preconditions") ??
        xmlChild(node, "preconds"),
    ),
    steps: formatted.steps || textSteps,
    expectedResult:
      formatted.expectedResult ||
      xmlText(
        xmlChild(custom, "expected") ?? xmlChild(node, "expected"),
      ),
    priority: xmlText(xmlChild(node, "priority")),
    status: xmlText(xmlChild(node, "status") ?? xmlChild(node, "state")),
    section: folder,
    tags,
    type: xmlText(xmlChild(node, "type")),
  };
}

function walkSections(
  parent: XmlElement | undefined,
  path: string[],
  out: Record<string, string>[],
) {
  if (!parent) return;
  for (const section of xmlElements(parent, "section")) {
    const name = xmlText(xmlChild(section, "name"));
    const next = name ? [...path, name] : path;
    const casesEl = xmlChild(section, "cases");
    for (const node of casesEl ? xmlElements(casesEl, "case") : []) {
      out.push(flattenCase(node, next.join(" / ")));
    }
    walkSections(xmlChild(section, "sections"), next, out);
  }
}

function parseTestRailXml(raw: string): Record<string, string>[] {
  const root = parseXml(raw);
  const suite =
    xmlChild(root, "suite") ??
    xmlElements(root).find((el) => el.name === "suite") ??
    root;
  const rows: Record<string, string>[] = [];
  walkSections(xmlChild(suite, "sections"), [], rows);
  const topCases = xmlChild(suite, "cases") ?? xmlChild(root, "cases");
  if (topCases) {
    for (const node of xmlElements(topCases, "case")) {
      rows.push(flattenCase(node, xmlText(xmlChild(suite, "name"))));
    }
  }
  if (rows.length === 0) {
    for (const node of xmlElements(suite, "case")) {
      rows.push(flattenCase(node, ""));
    }
  }
  return rows;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        const rec = asRecord(item);
        return rec ? str(rec.title ?? rec.name ?? rec.label) : "";
      })
      .filter(Boolean)
      .join(";");
  }
  const rec = asRecord(value);
  if (!rec) return "";
  return str(rec.name ?? rec.label ?? rec.title ?? rec.value);
}

function flattenApiCase(
  raw: Record<string, unknown>,
  sectionName: string,
): Record<string, string> {
  const separated = raw.custom_steps_separated;
  const stepsArr = Array.isArray(separated)
    ? separated
    : Array.isArray(raw.custom_steps)
      ? raw.custom_steps
      : [];
  const formatted = formatSteps(
    stepsArr.map((step) => {
      const rec = asRecord(step) ?? {};
      return {
        action: str(rec.content ?? rec.step ?? rec.action),
        expected: str(rec.expected ?? rec.expected_result),
      };
    }),
  );
  const textSteps = str(raw.custom_steps);
  return {
    id: caseKey(str(raw.id)),
    title: str(raw.title),
    description: str(raw.custom_description ?? raw.description ?? raw.comment),
    preconditions: str(raw.custom_preconds ?? raw.custom_preconditions),
    steps: formatted.steps || (typeof raw.custom_steps === "string" ? textSteps : ""),
    expectedResult: formatted.expectedResult || str(raw.custom_expected),
    priority: str(raw.priority ?? raw.priority_id),
    status: str(raw.status ?? raw.state),
    section: sectionName || str(raw.section ?? raw.suite),
    tags: str(raw.refs ?? raw.references ?? raw.labels),
    type: str(raw.type ?? raw.type_id),
  };
}

function sectionPathMap(sections: unknown): Map<string, string> {
  const map = new Map<string, string>();
  const list = Array.isArray(sections)
    ? sections
    : asRecord(sections)?.sections;
  const rows = Array.isArray(list) ? list : [];
  const byId = new Map<string, { name: string; parent: string }>();
  for (const item of rows) {
    const rec = asRecord(item);
    if (!rec) continue;
    const id = str(rec.id);
    if (!id) continue;
    byId.set(id, { name: str(rec.name), parent: str(rec.parent_id) });
  }
  for (const id of byId.keys()) {
    const parts: string[] = [];
    let cursor: string | undefined = id;
    const guard = new Set<string>();
    while (cursor && byId.has(cursor) && !guard.has(cursor)) {
      guard.add(cursor);
      const node: { name: string; parent: string } = byId.get(cursor)!;
      if (node.name) parts.unshift(node.name);
      cursor = node.parent || undefined;
    }
    map.set(id, parts.join(" / "));
  }
  return map;
}

export function parseTestRailJson(raw: unknown): Record<string, string>[] {
  const rec = asRecord(raw);
  const cases = Array.isArray(raw)
    ? raw
    : Array.isArray(rec?.cases)
      ? rec.cases
      : Array.isArray(rec?.result)
        ? rec.result
        : [];
  const sections = sectionPathMap(rec?.sections ?? rec?.section_map);
  return cases
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) =>
      flattenApiCase(item, sections.get(str(item.section_id)) ?? ""),
    );
}

function parseJsonPayload(raw: string): Record<string, string>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("TestRail JSON could not be parsed");
  }
  return parseTestRailJson(parsed);
}

export function parseTestRail(raw: string): ImportParseResult {
  const errors: string[] = [];
  const format = sniff(raw);
  let rows: Record<string, string>[] = [];
  try {
    if (format === "xml") rows = parseTestRailXml(raw);
    else if (format === "json") rows = parseJsonPayload(raw);
    else rows = parseCsvTable(raw).rows;
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Failed to parse TestRail file");
  }

  const table: SourceTable = {
    provider: "testrail",
    format,
    fields: uniqueFields(rows, [
      "id",
      "title",
      "description",
      "preconditions",
      "steps",
      "expectedResult",
      "priority",
      "status",
      "section",
      "tags",
    ]),
    rows,
  };
  if (rows.length === 0 && errors.length === 0) {
    errors.push("No TestRail cases found in the file");
  }
  return { table, suggestedMapping: suggestMapping(table.fields), errors };
}

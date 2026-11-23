import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { assertionScopes, qualification } from "./coverage-review";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(name) : [name];
  }).sort();
}
const tests = [...walk("src"), ...walk("packages"), ...walk("e2e"), ...walk("tests"), ...walk("scripts/validation")]
  .filter((name) => /(?:\.test\.[jt]sx?$|\.spec\.ts$|test_.*\.py$)/.test(name));
const planFiles = ["docs/test-plan.md", "tasks/validation/launch-checks.md"];
const cases = planFiles.flatMap((source) => [...readFileSync(source, "utf8").matchAll(/^### ([A-Z][A-Z0-9-]+-\d+) — (.+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)].map((match) => {
  const [, id, title, body] = match;
  return {
    id, title, source, priority: body.match(/\bP[012]\b/)?.[0] ?? "P1",
    expectedBehavior: body.trim(),
    automatedChecks: [...new Set([...body.matchAll(/`([^`]+\.(?:spec\.ts|test\.ts|test\.tsx|py))`/g)].map((m) => m[1]))].filter((file) => existsSync(file)),
    assertionScope: assertionScopes[id] ?? null,
    manualChecks: qualification(id, body),
    assertionReview: assertionScopes[id] ? "reviewed scope; remaining documented steps require manual qualification" : "explicit manual qualification; candidate filenames do not prove this case", status: "not run",
  };
}));
const routes = walk("src/app").filter((file) => /\/(route\.ts|page\.tsx)$/.test(file)).flatMap((file) => {
  const source = readFileSync(file, "utf8");
  const url = "/" + file.replace(/^src\/app\//, "").replace(/\/(page\.tsx|route\.ts)$/, "").split("/").filter((s) => !s.startsWith("(")).join("/");
  const allowed = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
  const found = new Set<string>();
  if (file.endsWith("route.ts")) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const statement of ast.statements) {
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const item of statement.exportClause.elements) if (allowed.has(item.name.text)) found.add(item.name.text);
      }
      const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      if (ts.isFunctionDeclaration(statement) && statement.name && allowed.has(statement.name.text)) found.add(statement.name.text);
      if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
        const names = ts.isIdentifier(declaration.name) ? [declaration.name.text]
          : ts.isObjectBindingPattern(declaration.name) ? declaration.name.elements.map((element) => element.name.getText(ast)) : [];
        for (const name of names) if (allowed.has(name)) found.add(name);
      }
    }
  }
  const methods = file.endsWith("route.ts") ? [...found].sort() : ["PAGE"];
  return methods.map((method) => ({
    id: `ROUTE:${method}:${url}`, file, method, url,
    expectedBehavior: method === "PAGE" ? "Render authorized content and persist applicable interactions; review owning page and release cases." : "Enforce authentication, scopes, project boundaries, input validation and documented persistence contract.",
    automatedChecks: method !== "PAGE" ? ["tests/integration/security/unauth-sweep.integration.test.ts (unauthenticated handler checks only)"] : [],
    manualChecks: `NOT RUN for full contract: start test:e2e:debug on disposable services; exercise ${method} ${url} using the owning ${file} input schema and release-case steps. Verify valid/invalid payloads, admin/member/viewer/custom roles, foreign-project IDs, persisted reload, rollback on rejected write, and response headers. Use synthetic IDs from that server; public auth/share routes require the documented cookie-free flow. Unauthenticated handler sweep is only a denial check.`,
    assertionReview: "not reviewed", status: "not run", priority: method === "PAGE" ? "P1" : "P0",
  }));
});
const packages = readdirSync("packages", { withFileTypes: true }).filter((p) => p.isDirectory()).map((p) => ({
  id: `PACKAGE:${p.name}`, source: `packages/${p.name}/package.json`,
  expectedBehavior: "Validate the published package contract and documented examples, including failures and transport boundaries.",
  automatedChecks: tests.filter((test) => test.startsWith(`packages/${p.name}/`)),
  manualChecks: `UNQUALIFIED external-consumer install: create a temporary Node 22 project (Python venv for pytest-topology), install the local packages/${p.name} package, run its README example against the isolated debug app with the required scoped synthetic token, then verify successful output and invalid-token/file failures. Local workspace unit/transport tests do not certify registry publication.`, status: "not run", priority: "P1", assertionReview: "not reviewed",
}));
let readmeFence = false;
const promises = readFileSync("README.md", "utf8").split("\n").map((line, index) => ({ line, index }))
  .filter(({ line }) => {
    if (line.startsWith("```")) { readmeFence = !readmeFence; return false; }
    return !readmeFence && Boolean(line.trim()) && !/^\|[ -]+\||^# Topology$/.test(line);
  }).map(({ line, index }) => ({
    id: `README:${index + 1}`, source: `README.md:${index + 1}`, expectedBehavior: line,
    automatedChecks: [], manualChecks: `NOT RUN for complete promise: use the owned debug app and follow README.md:${index + 1}, including linked setup/example documents. Check this exact promise against the corresponding docs/test-plan.md cases; capture resulting data after reload and failed-input behavior. Docker, Node 22, Python/pytest and browser binaries required; remote-provider promises additionally require an authorized sandbox and credentials.`,
    priority: "P1", assertionReview: "not reviewed", status: "not run",
  }));
const audit = tests.flatMap((file) => readFileSync(file, "utf8").split("\n").flatMap((line, index) => {
  const flags = [
    [/\b(?:test|it|describe)\.(?:skip|skipIf|fixme)\b/, "skip or fixme"],
    [/\.catch\(/, "catch requires error-propagation review"],
    [/if\s*\(.*(?:visible|count|ok|length|exists)/i, "conditional assertion path"],
    [/byteLength.*toBeGreaterThan|toBeGreaterThan\(10\)/, "size-only assertion"],
  ] as const;
  return flags.filter(([pattern]) => pattern.test(line)).map(([, reason]) => ({ file, line: index + 1, reason, review: "pending assertion review" }));
}));
mkdirSync("tasks/validation", { recursive: true });
const inventory = { note: "Reviewed assertion scopes are separate from complete release-case qualification. Each case retains exact expected steps and explicit manual prerequisites. Runtime evidence belongs to immutable run summaries; filenames and aggregate suite passes do not certify unasserted behavior.", cases, routes, packages, promises, assertionAudit: audit };
const matrix = `# Coverage inventory\n\nGenerated by \`npm run test:inventory\`. Whole-case manual status remains **not run** unless its entire documented contract has been qualified. Reviewed automated assertion scopes are in inventory.json and coverage-review.ts; execution evidence is in run summaries. See inventory.json for expected behaviors, route/method/package/README inventories and assertion audit. Execution evidence must be reconciled by a reviewer; filenames never establish coverage.\n\n| ID | Expected behavior | Priority | Candidate automation | Evidence |\n| --- | --- | --- | --- | --- |\n` + cases.map((c) => `| ${c.id} | ${c.title.replaceAll("|", "\\|")} | ${c.priority} | ${assertionScopes[c.id]?.checks.join(", ") || "explicit manual qualification (inventory.json)"} | ${assertionScopes[c.id] ? "reviewed assertion scope; remainder unqualified" : "manual qualification not run"} |`).join("\n") + "\n";
for (const [file, expected] of [
  ["tasks/validation/inventory.json", JSON.stringify(inventory, null, 2) + "\n"],
  ["tasks/validation/coverage-matrix.md", matrix],
]) {
  if (process.argv.includes("--check")) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== expected) {
      throw new Error(`${file} is stale. Run npm run test:inventory and review the changes.`);
    }
  } else {
    writeFileSync(file, expected);
  }
}
console.log(JSON.stringify({ releaseCases: cases.length, routes: routes.length, packages: packages.length, readmePromises: promises.length, assertionReviewCandidates: audit.length }));
if (new Set(cases.map((row) => row.id)).size !== cases.length) throw new Error("Duplicate release case IDs");
if (!cases.length || !routes.length) throw new Error("Inventory unexpectedly empty");

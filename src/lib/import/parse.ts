import { applyMapping, buildMappingPreview } from "./mapping";
import { parseQase } from "./qase";
import { parseTestRail } from "./testrail";
import {
  IMPORT_PROVIDERS,
  type FieldMapping,
  type ImportParseResult,
  type ImportProvider,
  type MappedCase,
  type MappingPreview,
} from "./types";
import { parseXray } from "./xray";
import { parseZephyr } from "./zephyr";

export function isImportProvider(value: string): value is ImportProvider {
  return (IMPORT_PROVIDERS as readonly string[]).includes(value);
}

export function parseImportSource(
  provider: ImportProvider,
  raw: string,
): ImportParseResult {
  switch (provider) {
    case "testrail":
      return parseTestRail(raw);
    case "qase":
      return parseQase(raw);
    case "zephyr":
      return parseZephyr(raw);
    case "xray":
      return parseXray(raw);
  }
}

export function previewImport(
  provider: ImportProvider,
  raw: string,
  mapping?: FieldMapping,
): MappingPreview {
  const parsed = parseImportSource(provider, raw);
  return buildMappingPreview(parsed.table, mapping, parsed.errors);
}

export function buildImportRows(
  provider: ImportProvider,
  raw: string,
  mapping?: FieldMapping,
): { rows: MappedCase[]; errors: string[]; preview: MappingPreview } {
  const parsed = parseImportSource(provider, raw);
  const preview = buildMappingPreview(parsed.table, mapping, parsed.errors);
  const applied = applyMapping(parsed.table, preview.mapping);
  return {
    rows: applied.rows,
    errors: [...parsed.errors, ...applied.errors],
    preview,
  };
}

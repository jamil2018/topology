export const CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "boolean",
  "select",
  "date",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];
export type CustomFieldEntity = "case" | "result";

export type CustomFieldDef = {
  id?: string;
  key: string;
  label: string;
  type: CustomFieldType;
  options?: readonly string[] | null;
  required?: boolean;
  entity?: CustomFieldEntity;
};

export type FieldValidationError = {
  key: string;
  message: string;
};

const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeFieldKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

export function validateFieldDef(input: {
  key: string;
  label: string;
  type: string;
  options?: readonly string[] | null;
}): { ok: true; def: CustomFieldDef } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const key = normalizeFieldKey(input.key);
  const label = input.label.trim();
  if (!KEY_RE.test(key)) {
    errors.push("Key must start with a letter and use lowercase, digits, or _");
  }
  if (!label) errors.push("Label is required");
  if (!CUSTOM_FIELD_TYPES.includes(input.type as CustomFieldType)) {
    errors.push("Unknown field type");
  }
  const type = input.type as CustomFieldType;
  const options = (input.options ?? []).map((o) => o.trim()).filter(Boolean);
  if (type === "select" && options.length === 0) {
    errors.push("Select fields need at least one option");
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    def: { key, label, type, options, required: false },
  };
}

function asTrimmedString(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

export function validateFieldValues(
  defs: readonly CustomFieldDef[],
  values: Record<string, unknown> | null | undefined,
): {
  ok: boolean;
  errors: FieldValidationError[];
  normalized: Record<string, unknown>;
} {
  const errors: FieldValidationError[] = [];
  const normalized: Record<string, unknown> = {};
  const incoming = values ?? {};

  for (const def of defs) {
    const raw = incoming[def.key];
    const required = Boolean(def.required);
    const empty =
      raw === undefined ||
      raw === null ||
      (typeof raw === "string" && raw.trim() === "");

    if (empty) {
      if (required) {
        errors.push({ key: def.key, message: `${def.label} is required` });
      }
      continue;
    }

    switch (def.type) {
      case "text": {
        normalized[def.key] = asTrimmedString(raw);
        break;
      }
      case "number": {
        const n = typeof raw === "number" ? raw : Number(asTrimmedString(raw));
        if (!Number.isFinite(n)) {
          errors.push({ key: def.key, message: `${def.label} must be a number` });
        } else {
          normalized[def.key] = n;
        }
        break;
      }
      case "boolean": {
        if (typeof raw === "boolean") {
          normalized[def.key] = raw;
        } else if (asTrimmedString(raw).toLowerCase() === "true") {
          normalized[def.key] = true;
        } else if (asTrimmedString(raw).toLowerCase() === "false") {
          normalized[def.key] = false;
        } else {
          errors.push({
            key: def.key,
            message: `${def.label} must be true or false`,
          });
        }
        break;
      }
      case "select": {
        const option = asTrimmedString(raw);
        const options = def.options ?? [];
        if (!options.includes(option)) {
          errors.push({
            key: def.key,
            message: `${def.label} must be one of: ${options.join(", ")}`,
          });
        } else {
          normalized[def.key] = option;
        }
        break;
      }
      case "date": {
        const date = asTrimmedString(raw);
        if (!ISO_DATE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
          errors.push({
            key: def.key,
            message: `${def.label} must be YYYY-MM-DD`,
          });
        } else {
          normalized[def.key] = date;
        }
        break;
      }
      default:
        errors.push({ key: def.key, message: "Unknown field type" });
    }
  }

  return { ok: errors.length === 0, errors, normalized };
}

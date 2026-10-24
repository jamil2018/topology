import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  getMembershipForProject,
  readPreferredProjectId,
  requireProjectAccess,
} from "@/lib/project";
import {
  IMPORT_PROVIDERS,
  type FieldMapping,
  type ImportApiConfig,
  type ImportProvider,
  type TopologyCaseField,
  TOPOLOGY_CASE_FIELDS,
} from "./types";

const MAX_CONTENT_CHARS = 8 * 1024 * 1024;

const mappingSchema = z
  .object(
    Object.fromEntries(
      TOPOLOGY_CASE_FIELDS.map((field) => [field, z.string().optional()]),
    ) as Record<TopologyCaseField, z.ZodOptional<z.ZodString>>,
  )
  .partial();

const apiSchema = z.object({
  baseUrl: z.string().optional().default(""),
  token: z.string().min(1),
  email: z.string().optional(),
  project: z.string().optional(),
});

export type ParsedImportBody = {
  provider: ImportProvider;
  mapping: FieldMapping;
  dryRun: boolean;
  content: string;
  filename: string;
  api: ImportApiConfig | null;
};

export async function requireImportAccess(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const preferred = await readPreferredProjectId(request);
  if (preferred) {
    if (!z.string().uuid().safeParse(preferred).success) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "Invalid project id" }, { status: 400 }),
      };
    }
    const membership = await getMembershipForProject(session.user.id, preferred);
    if (!membership?.workspace) {
      return {
        ok: false as const,
        response: NextResponse.json({ error: "Project not found" }, { status: 404 }),
      };
    }
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.create",
  });
  if (!access.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: access.error },
        { status: access.status },
      ),
    };
  }

  return {
    ok: true as const,
    session,
    workspaceId: access.ctx.project.id,
  };
}

function parseProvider(value: unknown): ImportProvider | null {
  if (typeof value !== "string") return null;
  return (IMPORT_PROVIDERS as readonly string[]).includes(value)
    ? (value as ImportProvider)
    : null;
}

function parseMapping(value: unknown): FieldMapping {
  if (typeof value === "string") {
    try {
      return parseMapping(JSON.parse(value));
    } catch {
      return {};
    }
  }
  const parsed = mappingSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

function parseApi(value: unknown): ImportApiConfig | null {
  if (typeof value === "string") {
    try {
      return parseApi(JSON.parse(value));
    } catch {
      return null;
    }
  }
  const parsed = apiSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function readImportBody(
  request: Request,
): Promise<
  { ok: true; body: ParsedImportBody } | { ok: false; response: NextResponse }
> {
  const contentType = request.headers.get("content-type") ?? "";
  let providerRaw: unknown;
  let mappingRaw: unknown;
  let dryRunRaw: unknown = false;
  let content = "";
  let filename = "";
  let apiRaw: unknown;

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Upload exceeds the size limit or could not be parsed" },
          { status: 413 },
        ),
      };
    }
    providerRaw = form.get("provider");
    mappingRaw = form.get("mapping");
    dryRunRaw = form.get("dryRun");
    apiRaw = form.get("api");
    const file = form.get("file");
    const text = form.get("content");
    if (file instanceof File) {
      content = await file.text();
      filename = file.name;
    } else if (typeof text === "string") {
      content = text;
    }
  } else {
    let json: Record<string, unknown>;
    try {
      json = (await request.json()) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        response: NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
    providerRaw = json.provider;
    mappingRaw = json.mapping;
    dryRunRaw = json.dryRun;
    apiRaw = json.api;
    if (typeof json.content === "string") content = json.content;
    if (typeof json.filename === "string") filename = json.filename;
  }

  const provider = parseProvider(providerRaw);
  if (!provider) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "provider is required (testrail, qase, zephyr, xray)" },
        { status: 400 },
      ),
    };
  }

  if (content.length > MAX_CONTENT_CHARS) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Import file is too large" },
        { status: 413 },
      ),
    };
  }

  const dryRun =
    dryRunRaw === true ||
    dryRunRaw === "true" ||
    dryRunRaw === "1" ||
    dryRunRaw === 1;

  return {
    ok: true,
    body: {
      provider,
      mapping: parseMapping(mappingRaw),
      dryRun,
      content,
      filename,
      api: parseApi(apiRaw),
    },
  };
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  clearRetestFlag,
  createIssueFromResult,
  linkExistingIssue,
  listRetestQueue,
  markIssueClosedLocally,
  refreshLinkedIssue,
} from "@/lib/issues";
import { requireProjectAccess } from "@/lib/project";
import { listIssueProviders } from "@topology/issue-providers";

const createSchema = z.object({
  action: z.literal("create"),
  resultId: z.string().uuid(),
  provider: z.enum(["mock", "jira", "linear", "github"]).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  projectKey: z.string().optional(),
  teamId: z.string().optional(),
  repo: z.string().optional(),
});

const linkSchema = z.object({
  action: z.literal("link"),
  resultId: z.string().uuid(),
  remoteKey: z.string().min(1),
  provider: z.enum(["mock", "jira", "linear", "github"]).optional(),
});

const refreshSchema = z.object({
  action: z.literal("refresh"),
  issueId: z.string().uuid(),
});

const retestAckSchema = z.object({
  action: z.literal("ack_retest"),
  issueId: z.string().uuid(),
});

const markClosedSchema = z.object({
  action: z.literal("mark_closed"),
  issueId: z.string().uuid(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const retestQueue = await listRetestQueue(access.ctx.project.id);
  return NextResponse.json({
    providers: listIssueProviders(),
    defaultProvider: process.env.TOPOLOGY_ISSUE_PROVIDER ?? "mock",
    retestQueue,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    write: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json();
  const action = body?.action;

  try {
    if (action === "create") {
      const parsed = createSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const issue = await createIssueFromResult({
        ...parsed.data,
        userId: session.user.id,
      });
      return NextResponse.json({ issue });
    }

    if (action === "link") {
      const parsed = linkSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const issue = await linkExistingIssue({
        ...parsed.data,
        userId: session.user.id,
      });
      return NextResponse.json({ issue });
    }

    if (action === "refresh") {
      const parsed = refreshSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const issue = await refreshLinkedIssue(parsed.data.issueId);
      return NextResponse.json({ issue });
    }

    if (action === "ack_retest") {
      const parsed = retestAckSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const issue = await clearRetestFlag(parsed.data.issueId);
      return NextResponse.json({ issue });
    }

    if (action === "mark_closed") {
      const parsed = markClosedSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 },
        );
      }
      const issue = await markIssueClosedLocally(parsed.data.issueId);
      return NextResponse.json({ issue });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Issue action failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

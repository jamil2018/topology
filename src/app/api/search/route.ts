import { NextResponse } from "next/server";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import {
  cases,
  folders,
  requirements,
  resultComments,
  risks,
  runResults,
  runs,
  testIntents,
} from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";

const HEADLINE_OPTS = "MaxFragments=1,MaxWords=18,MinWords=5,StartSel=,StopSel=";

type CaseHit = {
  id: string;
  key: string;
  title: string;
  snippet: string | null;
  matchField: string;
};

type RunHit = {
  id: string;
  name: string;
  status: string;
  snippet: string | null;
};

type FolderHit = {
  id: string;
  name: string;
  snippet: string | null;
};

type CommentHit = {
  id: string;
  resultId: string;
  runId: string;
  snippet: string;
  matchField: "comment";
};

type KeyedHit = {
  id: string;
  key: string;
  title: string;
  snippet: string | null;
  matchField: string;
};

function emptyResponse(qualityGraphEnabled: boolean) {
  return {
    cases: [] as CaseHit[],
    runs: [] as RunHit[],
    folders: [] as FolderHit[],
    comments: [] as CommentHit[],
    ...(qualityGraphEnabled
      ? {
          requirements: [] as KeyedHit[],
          intents: [] as KeyedHit[],
          risks: [] as KeyedHit[],
        }
      : {}),
  };
}

function stripHeadline(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || null;
}

/** Lightweight search for the command palette. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;
  const qualityGraphEnabled = access.ctx.project.qualityGraphEnabled ?? false;

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) {
    return NextResponse.json(emptyResponse(qualityGraphEnabled));
  }
  if (q.length > 200 || q.includes("\0")) {
    return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
  }

  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const prefixPattern = `${q.replace(/[\\%_]/g, "\\$&")}%`;
  const tsq = sql`websearch_to_tsquery('english', ${q})`;
  const hasTsq = sql`length(trim(${tsq}::text)) > 0`;

  try {
    const casePromise = db
      .select({
        id: cases.id,
        key: cases.key,
        title: cases.title,
        matchField: sql<string>`
          case
            when lower(${cases.key}) = lower(${q}) then 'key'
            when ${cases.key} ilike ${prefixPattern} escape '\\' then 'key'
            when ${hasTsq} and "cases"."search_vector" @@ ${tsq} then 'case'
            when ${hasTsq} and exists (
              select 1 from "case_steps" cs
              where cs."case_id" = ${cases.id}
                and cs."search_vector" @@ ${tsq}
            ) then 'step'
            when ${cases.title} ilike ${pattern} escape '\\' then 'title'
            when ${cases.description} ilike ${pattern} escape '\\' then 'description'
            else 'case'
          end
        `,
        snippet: sql<string | null>`
          coalesce(
            case
              when ${hasTsq} and exists (
                select 1 from "case_steps" cs
                where cs."case_id" = ${cases.id}
                  and cs."search_vector" @@ ${tsq}
              )
                and not (
                  ${hasTsq} and "cases"."search_vector" @@ ${tsq}
                )
                and not (
                  lower(${cases.key}) = lower(${q})
                  or ${cases.key} ilike ${prefixPattern} escape '\\'
                )
              then (
                select nullif(
                  trim(
                    ts_headline(
                      'english',
                      coalesce(cs."action", '') || ' ' || coalesce(cs."expected", ''),
                      ${tsq},
                      ${HEADLINE_OPTS}
                    )
                  ),
                  ''
                )
                from "case_steps" cs
                where cs."case_id" = ${cases.id}
                  and cs."search_vector" @@ ${tsq}
                order by ts_rank(cs."search_vector", ${tsq}) desc
                limit 1
              )
              when ${hasTsq} and "cases"."search_vector" @@ ${tsq}
              then nullif(
                trim(
                  ts_headline(
                    'english',
                    coalesce(${cases.description}, '') || ' ' || coalesce(${cases.title}, ''),
                    ${tsq},
                    ${HEADLINE_OPTS}
                  )
                ),
                ''
              )
              else null
            end,
            ${cases.title}
          )
        `,
        rank: sql<number>`
          case
            when lower(${cases.key}) = lower(${q}) then 1000
            when ${cases.key} ilike ${prefixPattern} escape '\\' then 800
            when ${hasTsq} and "cases"."search_vector" @@ ${tsq}
              then 100 + ts_rank("cases"."search_vector", ${tsq})
            when ${hasTsq} and exists (
              select 1 from "case_steps" cs
              where cs."case_id" = ${cases.id}
                and cs."search_vector" @@ ${tsq}
            ) then 50 + coalesce(
              (
                select ts_rank(cs."search_vector", ${tsq})
                from "case_steps" cs
                where cs."case_id" = ${cases.id}
                  and cs."search_vector" @@ ${tsq}
                order by ts_rank(cs."search_vector", ${tsq}) desc
                limit 1
              ),
              0
            )
            else 10
          end
        `,
      })
      .from(cases)
      .where(
        and(
          eq(cases.workspaceId, workspaceId),
          or(
            sql`lower(${cases.key}) = lower(${q})`,
            sql`${cases.key} ilike ${prefixPattern} escape '\\'`,
            sql`${hasTsq} and "cases"."search_vector" @@ ${tsq}`,
            sql`${hasTsq} and exists (
              select 1 from "case_steps" cs
              where cs."case_id" = ${cases.id}
                and cs."search_vector" @@ ${tsq}
            )`,
            ilike(cases.title, pattern),
            ilike(cases.description, pattern),
          ),
        ),
      )
      .orderBy(sql`rank desc`, desc(cases.updatedAt))
      .limit(8);

    const runPromise = db
      .select({
        id: runs.id,
        name: runs.name,
        status: runs.status,
        snippet: sql<string | null>`
          coalesce(
            case
              when ${hasTsq}
                and to_tsvector(
                  'english',
                  coalesce(${runs.name}, '') || ' ' || coalesce(${runs.description}, '')
                ) @@ ${tsq}
              then nullif(
                trim(
                  ts_headline(
                    'english',
                    coalesce(${runs.description}, '') || ' ' || coalesce(${runs.name}, ''),
                    ${tsq},
                    ${HEADLINE_OPTS}
                  )
                ),
                ''
              )
              else null
            end,
            ${runs.name}
          )
        `,
      })
      .from(runs)
      .where(
        and(
          eq(runs.workspaceId, workspaceId),
          or(
            ilike(runs.name, pattern),
            ilike(runs.description, pattern),
            sql`${hasTsq} and to_tsvector(
              'english',
              coalesce(${runs.name}, '') || ' ' || coalesce(${runs.description}, '')
            ) @@ ${tsq}`,
          ),
        ),
      )
      .orderBy(desc(runs.updatedAt))
      .limit(6);

    const folderPromise = db
      .select({
        id: folders.id,
        name: folders.name,
        snippet: sql<string | null>`${folders.name}`,
      })
      .from(folders)
      .where(
        and(
          eq(folders.workspaceId, workspaceId),
          or(
            ilike(folders.name, pattern),
            sql`${hasTsq} and to_tsvector('english', coalesce(${folders.name}, '')) @@ ${tsq}`,
          ),
        ),
      )
      .orderBy(folders.name)
      .limit(6);

    const commentPromise = db
      .select({
        id: resultComments.id,
        resultId: resultComments.resultId,
        runId: runs.id,
        snippet: sql<string>`
          coalesce(
            case
              when ${hasTsq}
                and to_tsvector('english', coalesce(${resultComments.body}, '')) @@ ${tsq}
              then nullif(
                trim(
                  ts_headline(
                    'english',
                    coalesce(${resultComments.body}, ''),
                    ${tsq},
                    ${HEADLINE_OPTS}
                  )
                ),
                ''
              )
              else null
            end,
            left(${resultComments.body}, 120)
          )
        `,
      })
      .from(resultComments)
      .innerJoin(runResults, eq(runResults.id, resultComments.resultId))
      .innerJoin(runs, eq(runs.id, runResults.runId))
      .where(
        and(
          eq(runs.workspaceId, workspaceId),
          or(
            ilike(resultComments.body, pattern),
            sql`${hasTsq} and to_tsvector('english', coalesce(${resultComments.body}, '')) @@ ${tsq}`,
          ),
        ),
      )
      .orderBy(desc(resultComments.createdAt))
      .limit(6);

    const keyedSelect = (table: typeof requirements | typeof risks) =>
      db
        .select({
          id: table.id,
          key: table.key,
          title: table.title,
          matchField: sql<string>`
            case
              when lower(${table.key}) = lower(${q}) then 'key'
              when ${table.key} ilike ${prefixPattern} escape '\\' then 'key'
              when ${table.title} ilike ${pattern} escape '\\' then 'title'
              else 'description'
            end
          `,
          snippet: sql<string | null>`
            coalesce(
              case
                when ${hasTsq}
                  and to_tsvector(
                    'english',
                    coalesce(${table.key}, '') || ' ' ||
                    coalesce(${table.title}, '') || ' ' ||
                    coalesce(${table.description}, '')
                  ) @@ ${tsq}
                then nullif(
                  trim(
                    ts_headline(
                      'english',
                      coalesce(${table.description}, '') || ' ' || coalesce(${table.title}, ''),
                      ${tsq},
                      ${HEADLINE_OPTS}
                    )
                  ),
                  ''
                )
                else null
              end,
              ${table.title}
            )
          `,
          rank: sql<number>`
            case
              when lower(${table.key}) = lower(${q}) then 1000
              when ${table.key} ilike ${prefixPattern} escape '\\' then 800
              when ${hasTsq}
                and to_tsvector(
                  'english',
                  coalesce(${table.key}, '') || ' ' ||
                  coalesce(${table.title}, '') || ' ' ||
                  coalesce(${table.description}, '')
                ) @@ ${tsq}
              then 100 + ts_rank(
                to_tsvector(
                  'english',
                  coalesce(${table.key}, '') || ' ' ||
                  coalesce(${table.title}, '') || ' ' ||
                  coalesce(${table.description}, '')
                ),
                ${tsq}
              )
              else 10
            end
          `,
        })
        .from(table)
        .where(
          and(
            eq(table.workspaceId, workspaceId),
            or(
              sql`lower(${table.key}) = lower(${q})`,
              sql`${table.key} ilike ${prefixPattern} escape '\\'`,
              ilike(table.title, pattern),
              ilike(table.description, pattern),
              sql`${hasTsq} and to_tsvector(
                'english',
                coalesce(${table.key}, '') || ' ' ||
                coalesce(${table.title}, '') || ' ' ||
                coalesce(${table.description}, '')
              ) @@ ${tsq}`,
            ),
          ),
        )
        .orderBy(sql`rank desc`, desc(table.updatedAt))
        .limit(6);

    const intentPromise = qualityGraphEnabled
      ? db
          .select({
            id: testIntents.id,
            key: testIntents.key,
            title: testIntents.title,
            matchField: sql<string>`
              case
                when lower(${testIntents.key}) = lower(${q}) then 'key'
                when ${testIntents.key} ilike ${prefixPattern} escape '\\' then 'key'
                when ${testIntents.title} ilike ${pattern} escape '\\' then 'title'
                else 'behavior'
              end
            `,
            snippet: sql<string | null>`
              coalesce(
                case
                  when ${hasTsq}
                    and to_tsvector(
                      'english',
                      coalesce(${testIntents.key}, '') || ' ' ||
                      coalesce(${testIntents.title}, '') || ' ' ||
                      coalesce(${testIntents.behavior}, '')
                    ) @@ ${tsq}
                  then nullif(
                    trim(
                      ts_headline(
                        'english',
                        coalesce(${testIntents.behavior}, '') || ' ' || coalesce(${testIntents.title}, ''),
                        ${tsq},
                        ${HEADLINE_OPTS}
                      )
                    ),
                    ''
                  )
                  else null
                end,
                ${testIntents.title}
              )
            `,
            rank: sql<number>`
              case
                when lower(${testIntents.key}) = lower(${q}) then 1000
                when ${testIntents.key} ilike ${prefixPattern} escape '\\' then 800
                when ${hasTsq}
                  and to_tsvector(
                    'english',
                    coalesce(${testIntents.key}, '') || ' ' ||
                    coalesce(${testIntents.title}, '') || ' ' ||
                    coalesce(${testIntents.behavior}, '')
                  ) @@ ${tsq}
                then 100 + ts_rank(
                  to_tsvector(
                    'english',
                    coalesce(${testIntents.key}, '') || ' ' ||
                    coalesce(${testIntents.title}, '') || ' ' ||
                    coalesce(${testIntents.behavior}, '')
                  ),
                  ${tsq}
                )
                else 10
              end
            `,
          })
          .from(testIntents)
          .where(
            and(
              eq(testIntents.workspaceId, workspaceId),
              or(
                sql`lower(${testIntents.key}) = lower(${q})`,
                sql`${testIntents.key} ilike ${prefixPattern} escape '\\'`,
                ilike(testIntents.title, pattern),
                ilike(testIntents.behavior, pattern),
                sql`${hasTsq} and to_tsvector(
                  'english',
                  coalesce(${testIntents.key}, '') || ' ' ||
                  coalesce(${testIntents.title}, '') || ' ' ||
                  coalesce(${testIntents.behavior}, '')
                ) @@ ${tsq}`,
              ),
            ),
          )
          .orderBy(sql`rank desc`, desc(testIntents.updatedAt))
          .limit(6)
      : Promise.resolve(
          [] as Array<{
            id: string;
            key: string;
            title: string;
            matchField: string;
            snippet: string | null;
          }>,
        );

    const [caseRows, runRows, folderRows, commentRows, requirementRows, intentRows, riskRows] =
      await Promise.all([
        casePromise,
        runPromise,
        folderPromise,
        commentPromise,
        qualityGraphEnabled
          ? keyedSelect(requirements)
          : Promise.resolve(
              [] as Array<{
                id: string;
                key: string;
                title: string;
                matchField: string;
                snippet: string | null;
              }>,
            ),
        intentPromise,
        qualityGraphEnabled
          ? keyedSelect(risks)
          : Promise.resolve(
              [] as Array<{
                id: string;
                key: string;
                title: string;
                matchField: string;
                snippet: string | null;
              }>,
            ),
      ]);

    const payload = {
      cases: caseRows.map((row) => ({
        id: row.id,
        key: row.key,
        title: row.title,
        snippet: stripHeadline(row.snippet),
        matchField: row.matchField,
      })),
      runs: runRows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        snippet: stripHeadline(row.snippet),
      })),
      folders: folderRows.map((row) => ({
        id: row.id,
        name: row.name,
        snippet: stripHeadline(row.snippet),
      })),
      comments: commentRows.map((row) => ({
        id: row.id,
        resultId: row.resultId,
        runId: row.runId,
        snippet: stripHeadline(row.snippet) ?? "",
        matchField: "comment" as const,
      })),
      ...(qualityGraphEnabled
        ? {
            requirements: requirementRows.map((row) => ({
              id: row.id,
              key: row.key,
              title: row.title,
              snippet: stripHeadline(row.snippet),
              matchField: row.matchField,
            })),
            intents: intentRows.map((row) => ({
              id: row.id,
              key: row.key,
              title: row.title,
              snippet: stripHeadline(row.snippet),
              matchField: row.matchField,
            })),
            risks: riskRows.map((row) => ({
              id: row.id,
              key: row.key,
              title: row.title,
              snippet: stripHeadline(row.snippet),
              matchField: row.matchField,
            })),
          }
        : {}),
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("Search query failed", err);
    return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
  }
}

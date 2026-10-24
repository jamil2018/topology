export type LinkedIssue = {
  id: string;
  provider: string;
  remoteKey: string;
  url: string;
  title: string;
  remoteStatus: string;
  needsRetest: number;
};

export type MemberOption = {
  id: string;
  name: string | null;
  email: string;
};

export type CommentRow = {
  id: string;
  body: string;
  createdAt: string | Date;
  user: { id: string; name: string | null; email: string } | null;
};

export type AttachmentRow = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url?: string;
};

export type StepResultRow = {
  id: string;
  position: number;
  action: string;
  expected: string;
  data: string;
  status: string;
  notes: string;
};

export type ResultRow = {
  id: string;
  status: string;
  notes: string;
  assigneeId: string | null;
  iterationIndex?: number;
  iterationValuesJson?: string | null;
  linkedIssues: LinkedIssue[];
  comments: CommentRow[];
  attachments: AttachmentRow[];
  stepResults?: StepResultRow[];
  case: {
    id: string;
    key: string;
    title: string;
    steps: string;
    expectedResult: string;
  };
};

export type RunDetail = {
  id: string;
  name: string;
  status: string;
  description: string;
  assigneeId: string | null;
  results: ResultRow[];
};

export const RESULT_STATUSES = [
  "passed",
  "failed",
  "blocked",
  "skipped",
  "untested",
] as const;

export type ResultStatus = (typeof RESULT_STATUSES)[number];

export type StatusFilter = "all" | "untested" | "failed" | "blocked";

export type ResultListFilter = {
  status: StatusFilter;
  mine: boolean;
  query: string;
  currentUserId?: string | null;
};

export type RunAction =
  | {
      type: "result";
      resultId: string;
      status?: string;
      notes?: string;
      step?: { position: number; status: string };
      assigneeId?: string | null;
    }
  | { type: "run"; status?: string; assigneeId?: string | null };

export type StatusCounts = Record<ResultStatus, number>;

export function applyRunAction(current: RunDetail, action: RunAction): RunDetail {
  if (action.type === "run") {
    return {
      ...current,
      status: action.status ?? current.status,
      assigneeId:
        action.assigneeId !== undefined ? action.assigneeId : current.assigneeId,
    };
  }
  return {
    ...current,
    status: current.status === "planned" ? "in_progress" : current.status,
    results: current.results.map((row) => {
      if (row.id !== action.resultId) return row;
      const next = { ...row };
      if (action.status) next.status = action.status;
      if (action.notes !== undefined) next.notes = action.notes;
      if (action.assigneeId !== undefined) next.assigneeId = action.assigneeId;
      if (action.step && next.stepResults) {
        next.stepResults = next.stepResults.map((step) =>
          step.position === action.step!.position
            ? { ...step, status: action.step!.status }
            : step,
        );
      }
      return next;
    }),
  };
}

export function applyIssueToRun(
  current: RunDetail,
  issue: LinkedIssue,
  resultId?: string,
): RunDetail {
  return {
    ...current,
    results: current.results.map((row) => {
      const matchesResult = resultId ? row.id === resultId : true;
      if (!matchesResult && !row.linkedIssues.some((i) => i.id === issue.id)) {
        return row;
      }
      const existing = row.linkedIssues.some((i) => i.id === issue.id);
      return {
        ...row,
        linkedIssues: existing
          ? row.linkedIssues.map((i) => (i.id === issue.id ? issue : i))
          : resultId && row.id === resultId
            ? [...row.linkedIssues, issue]
            : row.linkedIssues,
      };
    }),
  };
}

export function applyCommentToRun(
  current: RunDetail,
  resultId: string,
  comment: CommentRow,
): RunDetail {
  return {
    ...current,
    results: current.results.map((row) =>
      row.id === resultId
        ? { ...row, comments: [...row.comments, comment] }
        : row,
    ),
  };
}

export function applyAttachmentToRun(
  current: RunDetail,
  resultId: string,
  attachment: AttachmentRow,
): RunDetail {
  return {
    ...current,
    results: current.results.map((row) =>
      row.id === resultId
        ? { ...row, attachments: [...row.attachments, attachment] }
        : row,
    ),
  };
}

export function countResultStatuses(results: { status: string }[]): StatusCounts {
  const counts: StatusCounts = {
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    untested: 0,
  };
  for (const row of results) {
    if (row.status in counts) {
      counts[row.status as ResultStatus] += 1;
    } else {
      counts.untested += 1;
    }
  }
  return counts;
}

export function filterRunResults<
  T extends {
    status: string;
    assigneeId: string | null;
    case: { key: string; title: string };
  },
>(results: T[], filter: ResultListFilter): T[] {
  const query = filter.query.trim().toLowerCase();
  return results.filter((row) => {
    if (filter.status !== "all" && row.status !== filter.status) return false;
    if (filter.mine) {
      if (!filter.currentUserId || row.assigneeId !== filter.currentUserId) {
        return false;
      }
    }
    if (!query) return true;
    const haystack = `${row.case.key} ${row.case.title}`.toLowerCase();
    return haystack.includes(query);
  });
}

export function initialFocusId(
  results: { id: string; status: string }[],
): string | null {
  return results.find((row) => row.status === "untested")?.id ?? results[0]?.id ?? null;
}

export function nextUntestedId(
  results: { id: string; status: string }[],
  afterId: string,
): string | null {
  if (results.length === 0) return null;
  const start = results.findIndex((row) => row.id === afterId);
  const from = start === -1 ? 0 : start + 1;
  for (let i = 0; i < results.length; i++) {
    const row = results[(from + i) % results.length];
    if (row.status === "untested") return row.id;
  }
  return null;
}

export function neighborId(
  results: { id: string }[],
  currentId: string | null,
  delta: number,
): string | null {
  if (results.length === 0) return currentId;
  const index = results.findIndex((row) => row.id === currentId);
  const from = index === -1 ? 0 : index;
  const next = Math.min(results.length - 1, Math.max(0, from + delta));
  return results[next]?.id ?? currentId;
}

export function memberLabel(
  members: MemberOption[],
  assigneeId: string | null,
): string | null {
  if (!assigneeId) return null;
  const member = members.find((row) => row.id === assigneeId);
  return member ? (member.name ?? member.email) : "Assigned";
}

export function isResultStatus(value: string): value is ResultStatus {
  return (RESULT_STATUSES as readonly string[]).includes(value);
}

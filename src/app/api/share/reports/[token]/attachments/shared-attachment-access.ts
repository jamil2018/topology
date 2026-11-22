/** True when the attachment belongs to a result on the shared run. */
export function attachmentBelongsToSharedRun(
  row:
    | {
        result?: {
          run?: { id: string; workspaceId: string } | null;
        } | null;
      }
    | null
    | undefined,
  payload: { targetId: string; workspaceId: string },
) {
  const run = row?.result?.run;
  return Boolean(
    run &&
      run.id === payload.targetId &&
      run.workspaceId === payload.workspaceId,
  );
}

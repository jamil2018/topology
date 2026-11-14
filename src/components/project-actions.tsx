"use client";

import { createContext, useContext, useCallback } from "react";
import { actionsAllowAdmin, actionsAllowWrite, type Action } from "@/lib/permissions";

type ProjectActions = { actions: readonly Action[]; projectId: string | null; userId: string | null; writable?: boolean; administrator?: boolean };
const Context = createContext<ProjectActions>({ actions: [], projectId: null, userId: null });
export function ProjectActionsProvider({ children, ...value }: ProjectActions & { children: React.ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useProjectActions() {
  const context = useContext(Context);
  const can = useCallback((action: Action) => context.actions.includes(action), [context.actions]);
  return { ...context, can, canWrite: context.writable ?? actionsAllowWrite(context.actions), canAdmin: context.administrator ?? actionsAllowAdmin(context.actions) };
}

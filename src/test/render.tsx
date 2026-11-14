import { render as testingRender, type RenderOptions } from "@testing-library/react";
import { ProjectActionsProvider } from "@/components/project-actions";
import { ACTION_CATALOG, type Action } from "@/lib/permissions";
export function render(ui: React.ReactNode, options?: RenderOptions & { actions?: readonly Action[] }) {
  const { actions = ACTION_CATALOG, ...rest } = options ?? {};
  return testingRender(<ProjectActionsProvider actions={actions} projectId="test-project" userId="test-user">{ui}</ProjectActionsProvider>, rest);
}

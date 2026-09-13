import type { ActiveProjectContext } from "@/lib/project";
import type { ProjectOption } from "@/components/project-switcher";

export function projectShellProps(ctx: ActiveProjectContext | null) {
  const projects: ProjectOption[] = (ctx?.projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    role: p.role,
  }));
  return {
    projects,
    activeProjectId: ctx?.project.id ?? null,
  };
}

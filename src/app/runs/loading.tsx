import { RunsPageSkeleton, ShellLoadingFrame } from "@/components/skeletons";

export default function RunsLoading() {
  return (
    <ShellLoadingFrame label="Loading runs">
      <RunsPageSkeleton />
    </ShellLoadingFrame>
  );
}

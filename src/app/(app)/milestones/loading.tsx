import {
  MilestonesPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function MilestonesLoading() {
  return (
    <ShellLoadingFrame label="Loading milestones">
      <MilestonesPageSkeleton />
    </ShellLoadingFrame>
  );
}

import {
  MilestonesPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function ReleasesLoading() {
  return (
    <ShellLoadingFrame label="Loading releases">
      <MilestonesPageSkeleton />
    </ShellLoadingFrame>
  );
}
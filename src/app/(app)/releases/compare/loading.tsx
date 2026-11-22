import {
  MilestonesPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function ReleaseCompareLoading() {
  return (
    <ShellLoadingFrame label="Loading release compare">
      <MilestonesPageSkeleton />
    </ShellLoadingFrame>
  );
}

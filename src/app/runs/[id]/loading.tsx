import { RunDetailSkeleton, ShellLoadingFrame } from "@/components/skeletons";

export default function RunDetailLoading() {
  return (
    <ShellLoadingFrame label="Loading run">
      <RunDetailSkeleton />
    </ShellLoadingFrame>
  );
}

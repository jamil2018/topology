import {
  ReportDetailSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function MilestoneDetailLoading() {
  return (
    <ShellLoadingFrame label="Loading milestone">
      <ReportDetailSkeleton />
    </ShellLoadingFrame>
  );
}

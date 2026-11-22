import {
  ReportDetailSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function PlanDetailLoading() {
  return (
    <ShellLoadingFrame label="Loading plan">
      <ReportDetailSkeleton />
    </ShellLoadingFrame>
  );
}

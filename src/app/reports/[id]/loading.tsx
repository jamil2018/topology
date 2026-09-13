import {
  ReportDetailSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function ReportDetailLoading() {
  return (
    <ShellLoadingFrame label="Loading report">
      <ReportDetailSkeleton />
    </ShellLoadingFrame>
  );
}

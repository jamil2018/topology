import {
  ReportDetailSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function ReleaseDetailLoading() {
  return (
    <ShellLoadingFrame label="Loading release">
      <ReportDetailSkeleton />
    </ShellLoadingFrame>
  );
}

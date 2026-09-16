import {
  ReportsPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function ReportsLoading() {
  return (
    <ShellLoadingFrame label="Loading reports">
      <ReportsPageSkeleton />
    </ShellLoadingFrame>
  );
}

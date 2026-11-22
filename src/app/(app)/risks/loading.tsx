import {
  AutomationPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function RisksLoading() {
  return (
    <ShellLoadingFrame label="Loading risks">
      <AutomationPageSkeleton />
    </ShellLoadingFrame>
  );
}

import {
  AutomationPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function ImpactLoading() {
  return (
    <ShellLoadingFrame label="Loading impact">
      <AutomationPageSkeleton />
    </ShellLoadingFrame>
  );
}

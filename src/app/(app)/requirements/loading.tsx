import {
  AutomationPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function RequirementsLoading() {
  return (
    <ShellLoadingFrame label="Loading requirements">
      <AutomationPageSkeleton />
    </ShellLoadingFrame>
  );
}

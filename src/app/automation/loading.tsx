import {
  AutomationPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function AutomationLoading() {
  return (
    <ShellLoadingFrame label="Loading automation">
      <AutomationPageSkeleton />
    </ShellLoadingFrame>
  );
}

import {
  AutomationPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function IntentsLoading() {
  return (
    <ShellLoadingFrame label="Loading intents">
      <AutomationPageSkeleton />
    </ShellLoadingFrame>
  );
}

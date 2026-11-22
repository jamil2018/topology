import {
  AutomationPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function ComponentsLoading() {
  return (
    <ShellLoadingFrame label="Loading components">
      <AutomationPageSkeleton />
    </ShellLoadingFrame>
  );
}

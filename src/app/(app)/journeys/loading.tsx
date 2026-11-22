import {
  AutomationPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function JourneysLoading() {
  return (
    <ShellLoadingFrame label="Loading journeys">
      <AutomationPageSkeleton />
    </ShellLoadingFrame>
  );
}

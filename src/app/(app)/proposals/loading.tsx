import {
  AutomationPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function ProposalsLoading() {
  return (
    <ShellLoadingFrame label="Loading proposals">
      <AutomationPageSkeleton />
    </ShellLoadingFrame>
  );
}

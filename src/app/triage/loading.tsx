import { ShellLoadingFrame, TriagePageSkeleton } from "@/components/skeletons";

export default function TriageLoading() {
  return (
    <ShellLoadingFrame label="Loading triage">
      <TriagePageSkeleton />
    </ShellLoadingFrame>
  );
}

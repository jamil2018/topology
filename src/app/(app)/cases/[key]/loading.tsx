import { CasesPageSkeleton, ShellLoadingFrame } from "@/components/skeletons";

export default function CaseDetailLoading() {
  return (
    <ShellLoadingFrame label="Loading case">
      <CasesPageSkeleton />
    </ShellLoadingFrame>
  );
}

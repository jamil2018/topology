import { CasesPageSkeleton, ShellLoadingFrame } from "@/components/skeletons";

export default function CasesLoading() {
  return (
    <ShellLoadingFrame label="Loading cases">
      <CasesPageSkeleton />
    </ShellLoadingFrame>
  );
}

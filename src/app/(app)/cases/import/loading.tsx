import { CasesPageSkeleton, ShellLoadingFrame } from "@/components/skeletons";

export default function ImportCasesLoading() {
  return (
    <ShellLoadingFrame label="Loading importer">
      <CasesPageSkeleton />
    </ShellLoadingFrame>
  );
}

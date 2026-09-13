import { StartRunPageSkeleton, ShellLoadingFrame } from "@/components/skeletons";

export default function StartRunLoading() {
  return (
    <ShellLoadingFrame label="Loading start run">
      <StartRunPageSkeleton />
    </ShellLoadingFrame>
  );
}

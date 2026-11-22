import { PlansPageSkeleton, ShellLoadingFrame } from "@/components/skeletons";

export default function PlansLoading() {
  return (
    <ShellLoadingFrame label="Loading plans">
      <PlansPageSkeleton />
    </ShellLoadingFrame>
  );
}

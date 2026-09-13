import { HubPageSkeleton, ShellLoadingFrame } from "@/components/skeletons";

export default function HubLoading() {
  return (
    <ShellLoadingFrame label="Loading hub">
      <HubPageSkeleton />
    </ShellLoadingFrame>
  );
}

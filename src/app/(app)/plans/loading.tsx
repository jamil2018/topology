import { PageHeaderSkeleton, ShellLoadingFrame } from "@/components/skeletons";

export default function PlansLoading() {
  return (
    <ShellLoadingFrame label="Loading plans">
      <div className="space-y-5">
        <PageHeaderSkeleton descriptionLines={1} badgeCount={1} actionCount={1} />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]"
            />
          ))}
        </div>
      </div>
    </ShellLoadingFrame>
  );
}

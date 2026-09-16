import {
  SettingsPageSkeleton,
  ShellLoadingFrame,
} from "@/components/skeletons";

export default function SettingsLoading() {
  return (
    <ShellLoadingFrame label="Loading settings">
      <SettingsPageSkeleton />
    </ShellLoadingFrame>
  );
}

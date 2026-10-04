import { ListSkeleton } from "@/components/dashboard/skeletons";

export default function SettingsLoading() {
  return <ListSkeleton label="Loading settings" rows={3} withCard />;
}

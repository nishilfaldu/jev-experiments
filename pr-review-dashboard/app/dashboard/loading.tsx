import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="grid gap-8 px-4 py-8 md:px-8 md:py-10">
      <div className="flex items-center justify-between border-b pb-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-20" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

"use client";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SignInScreen } from "@/components/dashboard/sign-in-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { useConvexAuth } from "convex/react";
import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  if (isLoading) {
    return (
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 md:px-8">
        <div className="flex items-center justify-between border-b pb-6">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (!isAuthenticated) {
    return <SignInScreen />;
  }
  return <DashboardShell>{children}</DashboardShell>;
}

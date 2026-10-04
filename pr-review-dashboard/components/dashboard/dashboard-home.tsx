"use client";

import { AnalysisActivity } from "@/components/dashboard/analysis-activity";
import { InstallGitHubApp } from "@/components/dashboard/install-github-app";
import { RepoList } from "@/components/dashboard/repo-list";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";

export function DashboardHome() {
  const overview = useQuery(api.dashboard.overview.get, {});
  if (overview === undefined) {
    return (
      <div className="grid gap-8">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (overview.kind === "unauthenticated") {
    return (
      <p className="text-sm text-muted-foreground">
        Sign in to view the installation.
      </p>
    );
  }

  const inProgressCount = overview.analysisActivity.inProgressCount;

  return (
    <div className="grid gap-8">
      <div className="border-b pb-6">
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Repositories
          </h1>
          {overview.installations.map((installation) => (
            <p
              key={installation.githubInstallationId}
              className="font-mono text-xs text-muted-foreground"
            >
              GitHub installation {installation.githubInstallationId} ·{" "}
              {installation.accountLogin}
            </p>
          ))}
        </div>
      </div>
      {overview.installations.length === 0 ? <InstallGitHubApp /> : null}
      <AnalysisActivity count={inProgressCount} />
      <RepoList
        repositories={overview.repositories}
        installationRecorded={overview.installations.length > 0}
      />
    </div>
  );
}

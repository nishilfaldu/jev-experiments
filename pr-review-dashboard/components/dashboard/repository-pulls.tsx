"use client";

import { AnalysisStatus } from "@/components/dashboard/analysis-status";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import { GitPullRequestIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "convex/react";
import Link from "next/link";

export function RepositoryPulls({
  owner,
  name,
}: {
  owner: string;
  name: string;
}) {
  const result = useQuery(api.dashboard.repository.get, { owner, name });

  if (result === undefined) {
    return (
      <div className="grid gap-8">
        <div className="grid gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-64" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (result.kind === "unauthenticated") {
    return <p className="text-sm text-muted-foreground">Sign in required.</p>;
  }
  if (result.kind === "not_found") {
    return (
      <Empty className="min-h-64 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={GitPullRequestIcon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>Repository not found</EmptyTitle>
          <EmptyDescription>
            {owner}/{name} is not part of this installation.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-8">
      <div className="grid gap-4 border-b pb-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/dashboard" />}>
                Repositories
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{result.repository.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {result.repository.fullName}
          </h1>
          <Badge variant="outline">
            {result.repository.private ? "Private" : "Public"}
          </Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          default / {result.repository.defaultBranch}
        </p>
      </div>

      {result.pullRequests.length === 0 ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={GitPullRequestIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No pull requests</EmptyTitle>
            <EmptyDescription>
              Open a pull request on GitHub to start an analysis.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table className="min-w-2xl">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="px-4">Pull request</TableHead>
                <TableHead>Analysis</TableHead>
                <TableHead className="text-right">Findings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.pullRequests.map((pullRequest) => (
                <TableRow key={pullRequest.githubPullNumber}>
                  <TableCell className="px-4 py-3">
                    <Link
                      href={`/dashboard/repos/${owner}/${name}/pulls/${pullRequest.githubPullNumber}`}
                      className="font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring"
                    >
                      <span className="font-mono text-muted-foreground">
                        #{pullRequest.githubPullNumber}
                      </span>{" "}
                      {pullRequest.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{pullRequest.authorLogin}</span>
                      <span aria-hidden>·</span>
                      <code>{pullRequest.headSha.slice(0, 7)}</code>
                    </div>
                  </TableCell>
                  <TableCell>
                    <AnalysisStatus
                      status={pullRequest.analysis.status}
                      phase={
                        pullRequest.analysis.status === "running"
                          ? pullRequest.analysis.phase
                          : undefined
                      }
                      partial={
                        pullRequest.analysis.status === "completed"
                          ? pullRequest.analysis.inputTruncated
                          : false
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {pullRequest.analysis.status === "completed"
                      ? pullRequest.analysis.findingCount
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

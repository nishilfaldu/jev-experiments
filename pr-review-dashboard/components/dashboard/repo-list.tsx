"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { api } from "@/convex/_generated/api";
import {
  ArrowRight01Icon,
  RefreshIcon,
  RepositoryIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAction } from "convex/react";
import Link from "next/link";
import { useState } from "react";

type Repository = {
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  pullRequestCount: number;
};

export function RepoList({
  repositories,
  installationRecorded,
}: {
  repositories: Repository[];
  installationRecorded: boolean;
}) {
  const sync = useAction(api.analysis.syncRepositories);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function syncRepositories() {
    setPending(true);
    setMessage(null);
    void sync({})
      .then((result) => {
        if (result.kind === "synced") return;
        if (result.kind === "missing_credentials") {
          setMessage(`Missing ${result.missing.join(", ")}.`);
          return;
        }
        if (result.kind === "no_installation") {
          setMessage("No GitHub App installation found.");
          return;
        }
        if (result.kind === "github_error") {
          setMessage(result.message);
          return;
        }
        setMessage("Sign in again to sync.");
      })
      .catch((error: unknown) => {
        setMessage(error instanceof Error ? error.message : "Sync failed.");
      })
      .finally(() => setPending(false));
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums">
          {repositories.length}{" "}
          {repositories.length === 1 ? "repository" : "repositories"}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !installationRecorded}
          onClick={syncRepositories}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            strokeWidth={2}
            className={pending ? "motion-safe:animate-spin" : undefined}
          />
          {pending ? "Syncing" : "Sync"}
        </Button>
      </div>
      {message ? (
        <p className="text-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
      {repositories.length === 0 ? (
        <Empty className="min-h-64 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={RepositoryIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No repositories</EmptyTitle>
            <EmptyDescription>
              {installationRecorded
                ? "No repositories are available yet. Sync to retry discovery."
                : "Install the GitHub App to choose repositories."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {repositories.map((repository) => (
            <li key={repository.fullName}>
              <Link
                href={`/dashboard/repos/${repository.owner}/${repository.name}`}
                className="group flex items-center gap-4 px-4 py-4 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-muted-foreground">
                  <HugeiconsIcon icon={RepositoryIcon} strokeWidth={2} />
                </span>
                <span className="grid min-w-0 flex-1 gap-1">
                  <span className="truncate font-medium">
                    {repository.fullName}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {repository.pullRequestCount} pull{" "}
                    {repository.pullRequestCount === 1 ? "request" : "requests"}
                  </span>
                </span>
                <Badge variant="outline">
                  {repository.private ? "Private" : "Public"}
                </Badge>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

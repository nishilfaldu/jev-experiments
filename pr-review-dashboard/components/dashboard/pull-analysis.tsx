"use client";

import { AnalysisStatus } from "@/components/dashboard/analysis-status";
import { ConfidenceDistribution } from "@/components/dashboard/confidence-distribution";
import { CompareDialog } from "@/components/dashboard/compare-dialog";
import { RuleOutcomeBadge } from "@/components/dashboard/rule-outcome-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { GitPullRequestIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { useState } from "react";

export function PullAnalysis({
  owner,
  name,
  pullNumber,
}: {
  owner: string;
  name: string;
  pullNumber: number;
}) {
  const result = useQuery(api.dashboard.pullRequest.get, {
    owner,
    name,
    pullNumber,
  });
  const rerunPullRequest = useAction(api.analysis.rerunPullRequest);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalysisError, setReanalysisError] = useState<string | null>(null);

  if (result === undefined) {
    return (
      <div className="grid gap-8">
        <div className="grid gap-3">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-4 w-72" />
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
          <EmptyTitle>Pull request not found</EmptyTitle>
          <EmptyDescription>
            {owner}/{name}#{pullNumber} is not available.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const analysis = result.analysis;
  const findingCount =
    analysis.status === "completed" ? analysis.findingCount : 0;
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
              <BreadcrumbLink
                render={<Link href={`/dashboard/repos/${owner}/${name}`} />}
              >
                {result.repositoryFullName}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                #{result.pullRequest.githubPullNumber}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-balance">
            {result.pullRequest.title}
          </h1>
          <div className="flex items-center gap-2">
            <AnalysisStatus
              status={analysis.status}
              phase={analysis.status === "running" ? analysis.phase : undefined}
              partial={
                analysis.status === "completed"
                  ? analysis.inputTruncated
                  : false
              }
            />
            <CompareDialog owner={owner} name={name} pullNumber={pullNumber} />
            <Button
              variant="outline"
              size="sm"
              disabled={
                reanalyzing ||
                analysis.status === "queued" ||
                analysis.status === "running"
              }
              onClick={() => {
                setReanalyzing(true);
                setReanalysisError(null);
                void rerunPullRequest({ owner, name, pullNumber })
                  .then((outcome) => {
                    if (outcome === "unavailable")
                      throw new Error(
                        "This PR is unavailable for re-analysis or has no active rules.",
                      );
                  })
                  .catch((error: unknown) => {
                    setReanalysisError(
                      error instanceof Error
                        ? error.message
                        : "Re-analysis failed.",
                    );
                  })
                  .finally(() => setReanalyzing(false));
              }}
            >
              {reanalyzing ? "Re-analyzing…" : "Re-analyze PR"}
            </Button>
          </div>
        </div>
        {reanalysisError ? (
          <p role="alert" className="text-sm text-destructive">
            {reanalysisError}
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{result.pullRequest.authorLogin}</span>
          <span aria-hidden>·</span>
          <code>{result.pullRequest.baseRef}</code>
          <span aria-hidden>←</span>
          <code>{result.pullRequest.headRef}</code>
          <span aria-hidden>·</span>
          <code>{result.pullRequest.headSha.slice(0, 7)}</code>
        </p>
      </div>

      {analysis.status === "completed" ? (
        <section className="grid gap-5" aria-labelledby="verdicts-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-baseline gap-2">
              <h2
                id="verdicts-heading"
                className="text-4xl font-semibold tracking-tight tabular-nums"
              >
                {findingCount}
              </h2>
              <span className="text-sm text-muted-foreground">
                {findingCount === 1 ? "finding" : "findings"}
              </span>
            </div>
            <p className="font-mono text-xs text-muted-foreground tabular-nums">
              {analysis.rules.length} rules / {analysis.model}
            </p>
          </div>
          {analysis.inputTruncated ? (
            <Alert>
              <AlertTitle>Partial analysis</AlertTitle>
              <AlertDescription>
                Only {analysis.analyzedDiffBytes.toLocaleString()} of{" "}
                {analysis.sourceDiffBytes.toLocaleString()} diff bytes were
                evaluated. Results may miss changes later in the pull request.
              </AlertDescription>
            </Alert>
          ) : null}
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {[...analysis.rules]
              .sort((left, right) => {
                if (left.finding === right.finding) {
                  return left.slug.localeCompare(right.slug);
                }
                return left.finding ? -1 : 1;
              })
              .map((rule) => (
                <li
                  key={rule.slug}
                  className={
                    rule.finding
                      ? "grid gap-4 bg-destructive/5 p-4 md:p-5"
                      : "grid gap-4 p-4 md:p-5"
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {rule.answer.kind === "noul" ? (
                        <RuleOutcomeBadge
                          finding={rule.finding}
                          valence={rule.answer.valence}
                          yes={rule.answer.vector.yes > rule.answer.vector.no}
                        />
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {rule.answer.kind === "choice" ? "Choice" : "Score"}
                        </span>
                      )}
                      <code className="text-sm font-medium">{rule.slug}</code>
                    </div>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {rule.question}
                  </p>
                  {rule.answer.kind === "noul" ? (
                    <ConfidenceDistribution
                      vector={rule.answer.vector}
                      confidence={rule.confidence}
                      valence={rule.answer.valence}
                    />
                  ) : rule.answer.kind === "choice" ? (
                    <div className="grid gap-3 text-sm">
                      <p>
                        <span className="text-muted-foreground">Selected:</span>{" "}
                        <strong>{rule.answer.choice}</strong>{" "}
                        <span className="text-muted-foreground">
                          · confidence {Math.round(rule.confidence * 100)}%
                        </span>
                      </p>
                      <div className="grid gap-2">
                        {rule.answer.probabilities.map(
                          ({ label, probability }) => (
                            <div
                              key={label}
                              className="grid grid-cols-[minmax(7rem,1fr)_minmax(8rem,2fr)_3rem] items-center gap-3"
                            >
                              <span className="truncate">{label}</span>
                              <div className="h-2 rounded-full bg-muted">
                                <div
                                  className="h-2 rounded-full bg-foreground/55"
                                  style={{ width: `${probability * 100}%` }}
                                />
                              </div>
                              <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                                {Math.round(probability * 100)}%
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-3 text-sm">
                      <p>
                        <span className="text-muted-foreground">Score:</span>{" "}
                        <strong className="font-mono tabular-nums">
                          {rule.answer.score.toFixed(1)} /{" "}
                          {rule.answer.rubric.length - 1}
                        </strong>{" "}
                        <span className="text-muted-foreground">
                          · confidence {Math.round(rule.confidence * 100)}%
                        </span>
                      </p>
                      <div className="grid gap-2">
                        {rule.answer.rubric.map((description, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-[1.5rem_minmax(8rem,1fr)_minmax(6rem,1fr)_3rem] items-center gap-3"
                          >
                            <span className="font-mono text-muted-foreground">
                              {index}
                            </span>
                            <span>{description}</span>
                            <div className="h-2 rounded-full bg-muted">
                              <div
                                className="h-2 rounded-full bg-foreground/55"
                                style={{
                                  width: `${rule.answer.kind === "score" ? rule.answer.probabilities[index] * 100 : 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                              {Math.round(
                                rule.answer.kind === "score"
                                  ? rule.answer.probabilities[index] * 100
                                  : 0,
                              )}
                              %
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      {analysis.status === "running" || analysis.status === "queued" ? (
        <Alert>
          <AlertTitle>
            {analysis.status === "queued"
              ? "Analysis is queued"
              : analysis.phase === "evaluating"
                ? "Rules are evaluating"
                : "Fetching the pull request diff"}
          </AlertTitle>
        </Alert>
      ) : null}

      {analysis.status === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>Analysis failed</AlertTitle>
          <AlertDescription>{analysis.errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {analysis.status === "none" ? (
        <Empty className="min-h-48 border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={GitPullRequestIcon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>Waiting for analysis</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : null}
    </div>
  );
}

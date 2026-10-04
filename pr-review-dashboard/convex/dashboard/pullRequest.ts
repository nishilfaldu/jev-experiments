import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { query, type QueryCtx } from "../_generated/server";
import { githubUserId } from "../model/account";
import { isFinding } from "../model/rules";
import { confidenceFromVector } from "../model/verdict";
import { ruleResultValidator, latestRun } from "./shared";

export const get = query({
  args: {
    owner: v.string(),
    name: v.string(),
    pullNumber: v.number(),
  },
  returns: v.union(
    v.object({ kind: v.literal("unauthenticated") }),
    v.object({ kind: v.literal("not_found") }),
    v.object({
      kind: v.literal("ready"),
      repositoryFullName: v.string(),
      pullRequest: v.object({
        githubPullNumber: v.number(),
        title: v.string(),
        htmlUrl: v.string(),
        authorLogin: v.string(),
        headSha: v.string(),
        baseRef: v.string(),
        headRef: v.string(),
      }),
      analysis: v.union(
        v.object({ status: v.literal("none") }),
        v.object({ status: v.literal("queued") }),
        v.object({
          status: v.literal("running"),
          phase: v.union(v.literal("fetching_diff"), v.literal("evaluating")),
        }),
        v.object({
          status: v.literal("failed"),
          errorMessage: v.string(),
        }),
        v.object({
          status: v.literal("completed"),
          model: v.string(),
          findingCount: v.number(),
          completedAt: v.number(),
          sourceDiffBytes: v.number(),
          analyzedDiffBytes: v.number(),
          inputTruncated: v.boolean(),
          rules: v.array(ruleResultValidator),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const githubAccountId = await githubUserId(ctx);
    if (githubAccountId === null) {
      return { kind: "unauthenticated" as const };
    }
    const repositoryDoc = await ctx.db
      .query("repositories")
      .withIndex("by_fullName", (q) =>
        q.eq("fullName", `${args.owner}/${args.name}`),
      )
      .unique();
    if (
      repositoryDoc === null ||
      !repositoryDoc.installed ||
      repositoryDoc.githubAccountId !== githubAccountId
    ) {
      return { kind: "not_found" as const };
    }
    const pullRequestDoc = await ctx.db
      .query("pullRequests")
      .withIndex("by_repositoryId_and_githubPullNumber", (q) =>
        q
          .eq("repositoryId", repositoryDoc._id)
          .eq("githubPullNumber", args.pullNumber),
      )
      .unique();
    if (
      pullRequestDoc === null ||
      pullRequestDoc.githubAccountId !== githubAccountId
    ) {
      return { kind: "not_found" as const };
    }
    const run = await latestRun(ctx, pullRequestDoc.latestAnalysisRunId);
    const analysis = await analysisForPull(ctx, run, githubAccountId);
    return {
      kind: "ready" as const,
      repositoryFullName: repositoryDoc.fullName,
      pullRequest: {
        githubPullNumber: pullRequestDoc.githubPullNumber,
        title: pullRequestDoc.title,
        htmlUrl: pullRequestDoc.htmlUrl,
        authorLogin: pullRequestDoc.authorLogin,
        headSha: pullRequestDoc.headSha,
        baseRef: pullRequestDoc.baseRef,
        headRef: pullRequestDoc.headRef,
      },
      analysis,
    };
  },
});

async function analysisForPull(
  ctx: QueryCtx,
  run: Doc<"analysisRuns"> | null,
  githubAccountId: number,
) {
  if (run === null) {
    return { status: "none" as const };
  }
  if (run.status === "queued") {
    return { status: "queued" as const };
  }
  if (run.status === "running") {
    return { status: "running" as const, phase: run.phase };
  }
  if (run.status === "failed") {
    return {
      status: "failed" as const,
      errorMessage: run.errorMessage,
    };
  }
  const evaluations = await ctx.db
    .query("ruleEvaluations")
    .withIndex("by_analysisRunId", (q) => q.eq("analysisRunId", run._id))
    .take(64);
  const activeRules = (
    await ctx.db
      .query("rules")
      .withIndex("by_githubAccountId_and_slug", (q) =>
        q.eq("githubAccountId", githubAccountId),
      )
      .take(100)
  ).filter((rule) => rule.active);
  const current = evaluations.filter((evaluation) =>
    activeRules.some(
      (rule) =>
        rule.slug === evaluation.ruleSlug &&
        rule.updatedAt === evaluation.ruleUpdatedAt,
    ),
  );
  if (current.length !== activeRules.length)
    return { status: "queued" as const };
  return {
    status: "completed" as const,
    model: run.model,
    findingCount: current.filter((evaluation) => isFinding(evaluation.answer))
      .length,
    completedAt: run.completedAt,
    sourceDiffBytes: run.sourceDiffBytes,
    analyzedDiffBytes: run.analyzedDiffBytes,
    inputTruncated: run.inputTruncated,
    rules: current.map((evaluation) => ({
      slug: evaluation.ruleSlug,
      question: evaluation.question,
      answer: evaluation.answer,
      finding: isFinding(evaluation.answer),
      confidence:
        evaluation.answer.kind === "noul"
          ? confidenceFromVector(evaluation.answer.vector)
          : evaluation.answer.confidence,
    })),
  };
}

import { v } from "convex/values";
import { query } from "../_generated/server";
import { githubUserId } from "../model/account";
import { isFinding } from "../model/rules";
import {
  LIST_LIMIT,
  repositorySummaryValidator,
  analysisSummaryValidator,
  latestRun,
  summarizeRun,
} from "./shared";

export const get = query({
  args: { owner: v.string(), name: v.string() },
  returns: v.union(
    v.object({ kind: v.literal("unauthenticated") }),
    v.object({ kind: v.literal("not_found") }),
    v.object({
      kind: v.literal("ready"),
      repository: repositorySummaryValidator,
      pullRequests: v.array(
        v.object({
          githubPullNumber: v.number(),
          title: v.string(),
          htmlUrl: v.string(),
          authorLogin: v.string(),
          headSha: v.string(),
          analysis: analysisSummaryValidator,
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
    const pullRequests = await ctx.db
      .query("pullRequests")
      .withIndex("by_repositoryId_and_githubPullNumber", (q) =>
        q.eq("repositoryId", repositoryDoc._id),
      )
      .order("desc")
      .take(LIST_LIMIT);
    const activeRules = (
      await ctx.db
        .query("rules")
        .withIndex("by_githubAccountId_and_slug", (q) =>
          q.eq("githubAccountId", githubAccountId),
        )
        .take(100)
    ).filter((rule) => rule.active);
    const summarized = [];
    for (const pullRequest of pullRequests) {
      if (pullRequest.githubAccountId !== githubAccountId) continue;
      const run = await latestRun(ctx, pullRequest.latestAnalysisRunId);
      let analysis = summarizeRun(run);
      if (run?.status === "completed") {
        const evaluations = await ctx.db
          .query("ruleEvaluations")
          .withIndex("by_analysisRunId", (q) => q.eq("analysisRunId", run._id))
          .take(64);
        const current = evaluations.filter((evaluation) =>
          activeRules.some(
            (rule) =>
              rule.slug === evaluation.ruleSlug &&
              rule.updatedAt === evaluation.ruleUpdatedAt,
          ),
        );
        analysis =
          current.length !== activeRules.length
            ? { status: "queued" as const }
            : {
                status: "completed" as const,
                model: run.model,
                findingCount: current.filter((evaluation) =>
                  isFinding(evaluation.answer),
                ).length,
                completedAt: run.completedAt,
                sourceDiffBytes: run.sourceDiffBytes,
                analyzedDiffBytes: run.analyzedDiffBytes,
                inputTruncated: run.inputTruncated,
              };
      }
      summarized.push({
        githubPullNumber: pullRequest.githubPullNumber,
        title: pullRequest.title,
        htmlUrl: pullRequest.htmlUrl,
        authorLogin: pullRequest.authorLogin,
        headSha: pullRequest.headSha,
        analysis,
      });
    }
    return {
      kind: "ready" as const,
      repository: {
        owner: repositoryDoc.owner,
        name: repositoryDoc.name,
        fullName: repositoryDoc.fullName,
        private: repositoryDoc.private,
        htmlUrl: repositoryDoc.htmlUrl,
        defaultBranch: repositoryDoc.defaultBranch,
        pullRequestCount: repositoryDoc.pullRequestCount,
      },
      pullRequests: summarized,
    };
  },
});

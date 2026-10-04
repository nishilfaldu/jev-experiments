import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { ruleAnswerValidator } from "../model/rules";

export const LIST_LIMIT = 100;

export const repositorySummaryValidator = v.object({
  owner: v.string(),
  name: v.string(),
  fullName: v.string(),
  private: v.boolean(),
  htmlUrl: v.string(),
  defaultBranch: v.string(),
  pullRequestCount: v.number(),
});

export const analysisSummaryValidator = v.union(
  v.object({ status: v.literal("none") }),
  v.object({ status: v.literal("queued") }),
  v.object({
    status: v.literal("running"),
    phase: v.union(v.literal("fetching_diff"), v.literal("evaluating")),
  }),
  v.object({ status: v.literal("failed"), errorMessage: v.string() }),
  v.object({
    status: v.literal("completed"),
    model: v.string(),
    findingCount: v.number(),
    completedAt: v.number(),
    sourceDiffBytes: v.number(),
    analyzedDiffBytes: v.number(),
    inputTruncated: v.boolean(),
  }),
);

export const ruleResultValidator = v.object({
  slug: v.string(),
  question: v.string(),
  answer: ruleAnswerValidator,
  finding: v.boolean(),
  confidence: v.number(),
});

export function summarizeRun(run: Doc<"analysisRuns"> | null) {
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
  return {
    status: "completed" as const,
    model: run.model,
    findingCount: run.findingCount,
    completedAt: run.completedAt,
    sourceDiffBytes: run.sourceDiffBytes,
    analyzedDiffBytes: run.analyzedDiffBytes,
    inputTruncated: run.inputTruncated,
  };
}

export async function latestRun(
  ctx: QueryCtx,
  analysisRunId: Id<"analysisRuns"> | null,
) {
  if (analysisRunId === null) {
    return null;
  }
  return await ctx.db.get("analysisRuns", analysisRunId);
}

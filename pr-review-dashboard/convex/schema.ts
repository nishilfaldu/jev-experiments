import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { deliveryEventValidator } from "./model/githubEvents";
import { ruleAnswerValidator, ruleContentValidator } from "./model/rules";

const deliveryIdentity = {
  githubDeliveryId: v.string(),
  event: deliveryEventValidator,
};

const deliveryOutcome = v.union(
  v.literal("analyzed"),
  v.literal("push_recorded"),
  v.literal("installation_recorded"),
  v.literal("ignored"),
);

const analysisIdentity = {
  webhookDeliveryId: v.union(v.id("webhookDeliveries"), v.null()),
  repositoryId: v.id("repositories"),
  pullRequestId: v.id("pullRequests"),
  githubAccountId: v.number(),
  headSha: v.string(),
};

export default defineSchema({
  ...authTables,
  installations: defineTable({
    githubInstallationId: v.number(),
    githubAccountId: v.number(),
    accountLogin: v.string(),
    accountType: v.string(),
  })
    .index("by_githubInstallationId", ["githubInstallationId"])
    .index("by_githubAccountId", ["githubAccountId"]),
  repositories: defineTable({
    githubInstallationId: v.number(),
    githubAccountId: v.number(),
    githubRepoId: v.number(),
    owner: v.string(),
    name: v.string(),
    fullName: v.string(),
    private: v.boolean(),
    htmlUrl: v.string(),
    defaultBranch: v.string(),
    pullRequestCount: v.number(),
    installed: v.boolean(),
  })
    .index("by_githubInstallationId", ["githubInstallationId"])
    .index("by_githubRepoId", ["githubRepoId"])
    .index("by_fullName", ["fullName"])
    .index("by_githubAccountId_and_installed", [
      "githubAccountId",
      "installed",
    ]),
  pullRequests: defineTable({
    repositoryId: v.id("repositories"),
    githubAccountId: v.number(),
    githubPullNumber: v.number(),
    githubPullId: v.number(),
    title: v.string(),
    htmlUrl: v.string(),
    authorLogin: v.string(),
    baseRef: v.string(),
    headRef: v.string(),
    headSha: v.string(),
    latestAnalysisRunId: v.union(v.id("analysisRuns"), v.null()),
  })
    .index("by_repositoryId_and_githubPullNumber", [
      "repositoryId",
      "githubPullNumber",
    ])
    .index("by_githubAccountId", ["githubAccountId"]),
  webhookDeliveries: defineTable(
    v.union(
      v.object({
        ...deliveryIdentity,
        status: v.literal("stored"),
      }),
      v.object({
        ...deliveryIdentity,
        status: v.literal("processing"),
        attempt: v.number(),
      }),
      v.object({
        ...deliveryIdentity,
        status: v.literal("processed"),
        outcome: deliveryOutcome,
      }),
      v.object({
        ...deliveryIdentity,
        status: v.literal("failed"),
        errorMessage: v.string(),
      }),
    ),
  )
    .index("by_githubDeliveryId", ["githubDeliveryId"])
    .index("by_status", ["status"]),
  analysisRuns: defineTable(
    v.union(
      v.object({
        ...analysisIdentity,
        status: v.literal("queued"),
      }),
      v.object({
        ...analysisIdentity,
        status: v.literal("running"),
        phase: v.union(v.literal("fetching_diff"), v.literal("evaluating")),
      }),
      v.object({
        ...analysisIdentity,
        status: v.literal("completed"),
        model: v.string(),
        sourceDiffBytes: v.number(),
        analyzedDiffBytes: v.number(),
        inputTruncated: v.boolean(),
        findingCount: v.number(),
        completedAt: v.number(),
      }),
      v.object({
        ...analysisIdentity,
        status: v.literal("failed"),
        errorMessage: v.string(),
      }),
    ),
  )
    .index("by_webhookDeliveryId", ["webhookDeliveryId"])
    .index("by_pullRequestId", ["pullRequestId"])
    .index("by_status", ["status"])
    .index("by_githubAccountId_and_status", ["githubAccountId", "status"]),
  rules: defineTable({
    githubAccountId: v.number(),
    slug: v.string(),
    content: ruleContentValidator,
    updatedAt: v.number(),
    active: v.boolean(),
  }).index("by_githubAccountId_and_slug", ["githubAccountId", "slug"]),
  ruleEdits: defineTable({
    ruleId: v.id("rules"),
    before: ruleContentValidator,
    after: ruleContentValidator,
    editedAt: v.number(),
  }).index("by_ruleId", ["ruleId"]),
  ruleEvaluations: defineTable({
    analysisRunId: v.id("analysisRuns"),
    pullRequestId: v.id("pullRequests"),
    ruleSlug: v.string(),
    ruleUpdatedAt: v.number(),
    question: v.string(),
    answer: ruleAnswerValidator,
    model: v.string(),
  })
    .index("by_analysisRunId", ["analysisRunId"])
    .index("by_pullRequestId", ["pullRequestId"]),
});

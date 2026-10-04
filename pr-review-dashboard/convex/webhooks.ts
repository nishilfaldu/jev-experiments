import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { PullRequestRef, RepositoryRef } from "./model/githubEvents";
import { deliveryEventValidator } from "./model/githubEvents";
import { isNormalizedVector } from "./model/probability";
import { isFinding, ruleAnswerValidator } from "./model/rules";
import schema from "./schema";

const installationValidator = v.object({
  githubInstallationId: v.number(),
  githubAccountId: v.number(),
  accountLogin: v.string(),
  accountType: v.string(),
});

const repositoryValidator = v.object({
  githubRepoId: v.number(),
  owner: v.string(),
  name: v.string(),
  fullName: v.string(),
  private: v.boolean(),
  htmlUrl: v.string(),
  defaultBranch: v.string(),
});

const pullRequestValidator = v.object({
  githubPullId: v.number(),
  githubPullNumber: v.number(),
  title: v.string(),
  htmlUrl: v.string(),
  authorLogin: v.string(),
  baseRef: v.string(),
  headRef: v.string(),
  headSha: v.string(),
});

const ingestResult = v.union(
  v.object({
    kind: v.literal("stored"),
    deliveryId: v.id("webhookDeliveries"),
  }),
  v.object({
    kind: v.literal("duplicate"),
    deliveryId: v.id("webhookDeliveries"),
    status: v.union(
      v.literal("stored"),
      v.literal("processing"),
      v.literal("processed"),
      v.literal("failed"),
    ),
  }),
);

export const ingest = internalMutation({
  args: {
    githubDeliveryId: v.string(),
    event: deliveryEventValidator,
  },
  returns: ingestResult,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("webhookDeliveries")
      .withIndex("by_githubDeliveryId", (q) =>
        q.eq("githubDeliveryId", args.githubDeliveryId),
      )
      .unique();
    if (existing !== null) {
      return {
        kind: "duplicate" as const,
        deliveryId: existing._id,
        status: existing.status,
      };
    }
    const deliveryId = await ctx.db.insert("webhookDeliveries", {
      ...args,
      status: "stored",
    });
    return { kind: "stored" as const, deliveryId };
  },
});

export const claim = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
  },
  returns: v.union(
    v.object({ kind: v.literal("claimed") }),
    v.object({ kind: v.literal("skipped"), status: v.string() }),
  ),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (delivery === null) {
      return { kind: "skipped" as const, status: "missing" };
    }
    if (delivery.status !== "stored") {
      return { kind: "skipped" as const, status: delivery.status };
    }
    await ctx.db.replace("webhookDeliveries", args.deliveryId, {
      ...identity(delivery),
      status: "processing",
      attempt: 1,
    });
    return { kind: "claimed" as const };
  },
});

export const markProcessed = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    outcome: v.union(
      v.literal("analyzed"),
      v.literal("push_recorded"),
      v.literal("installation_recorded"),
      v.literal("ignored"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (delivery === null || delivery.status !== "processing") {
      return null;
    }
    await ctx.db.replace("webhookDeliveries", args.deliveryId, {
      ...identity(delivery),
      status: "processed",
      outcome: args.outcome,
    });
    return null;
  },
});

export const markFailed = internalMutation({
  args: {
    deliveryId: v.id("webhookDeliveries"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db.get("webhookDeliveries", args.deliveryId);
    if (delivery === null || delivery.status !== "processing") {
      return null;
    }
    await ctx.db.replace("webhookDeliveries", args.deliveryId, {
      ...identity(delivery),
      status: "failed",
      errorMessage: args.errorMessage,
    });
    return null;
  },
});

export const getDelivery = internalQuery({
  args: { deliveryId: v.id("webhookDeliveries") },
  returns: v.union(schema.doc("webhookDeliveries"), v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get("webhookDeliveries", args.deliveryId);
  },
});

export const installationsForAccount = internalQuery({
  args: { githubAccountId: v.number() },
  returns: v.array(installationValidator),
  handler: async (ctx, args) =>
    (
      await ctx.db
        .query("installations")
        .withIndex("by_githubAccountId", (q) =>
          q.eq("githubAccountId", args.githubAccountId),
        )
        .collect()
    ).map(
      ({
        githubInstallationId,
        githubAccountId,
        accountLogin,
        accountType,
      }) => ({
        githubInstallationId,
        githubAccountId,
        accountLogin,
        accountType,
      }),
    ),
});

export const recordInstallation = internalMutation({
  args: { installation: installationValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await upsertInstallation(ctx, args.installation);
    return null;
  },
});

export const removeInstallation = internalMutation({
  args: { githubInstallationId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const installation = await ctx.db
      .query("installations")
      .withIndex("by_githubInstallationId", (q) =>
        q.eq("githubInstallationId", args.githubInstallationId),
      )
      .unique();
    if (installation === null) return null;
    const repositories = await ctx.db
      .query("repositories")
      .withIndex("by_githubInstallationId", (q) =>
        q.eq("githubInstallationId", args.githubInstallationId),
      )
      .collect();
    for (const repository of repositories)
      await ctx.db.patch("repositories", repository._id, { installed: false });
    await ctx.db.delete("installations", installation._id);
    return null;
  },
});

export const saveRepositories = internalMutation({
  args: {
    installation: installationValidator,
    repositories: v.array(repositoryValidator),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    await upsertInstallation(ctx, args.installation);
    const existing = await ctx.db
      .query("repositories")
      .withIndex("by_githubInstallationId", (q) =>
        q.eq("githubInstallationId", args.installation.githubInstallationId),
      )
      .collect();
    const returned = new Set(
      args.repositories.map((repository) => repository.githubRepoId),
    );
    for (const repository of existing) {
      if (!returned.has(repository.githubRepoId)) {
        await ctx.db.patch("repositories", repository._id, {
          installed: false,
        });
      }
    }
    for (const repository of args.repositories) {
      await upsertRepository(ctx, {
        ...repository,
        githubInstallationId: args.installation.githubInstallationId,
        githubAccountId: args.installation.githubAccountId,
        installed: true,
      });
    }
    return args.repositories.length;
  },
});

export const beginAnalysis = internalMutation({
  args: {
    deliveryId: v.union(v.id("webhookDeliveries"), v.null()),
    githubInstallationId: v.number(),
    githubAccountId: v.number(),
    repository: repositoryValidator,
    pullRequest: pullRequestValidator,
  },
  returns: v.union(
    v.object({
      kind: v.literal("ready"),
      analysisRunId: v.id("analysisRuns"),
      pullRequestId: v.id("pullRequests"),
    }),
    v.object({ kind: v.literal("already_completed") }),
  ),
  handler: async (ctx, args) => {
    const repositoryId = await upsertRepository(ctx, {
      ...args.repository,
      githubInstallationId: args.githubInstallationId,
      githubAccountId: args.githubAccountId,
      installed: true,
    });
    const pullRequestId = await upsertPullRequest(
      ctx,
      repositoryId,
      args.githubAccountId,
      args.pullRequest,
    );
    if (args.deliveryId !== null) {
      const existing = await ctx.db
        .query("analysisRuns")
        .withIndex("by_webhookDeliveryId", (q) =>
          q.eq("webhookDeliveryId", args.deliveryId),
        )
        .order("desc")
        .take(1);
      if (existing[0]?.status === "completed")
        return { kind: "already_completed" as const };
    }
    const analysisIdentity = {
      webhookDeliveryId: args.deliveryId,
      repositoryId,
      pullRequestId,
      githubAccountId: args.githubAccountId,
      headSha: args.pullRequest.headSha,
    };
    const running = {
      ...analysisIdentity,
      status: "running" as const,
      phase: "fetching_diff" as const,
    };
    for await (const evaluation of ctx.db
      .query("ruleEvaluations")
      .withIndex("by_pullRequestId", (q) =>
        q.eq("pullRequestId", pullRequestId),
      )) {
      await ctx.db.delete("ruleEvaluations", evaluation._id);
    }
    for await (const previous of ctx.db
      .query("analysisRuns")
      .withIndex("by_pullRequestId", (q) =>
        q.eq("pullRequestId", pullRequestId),
      )) {
      await ctx.db.delete("analysisRuns", previous._id);
    }
    const analysisRunId = await ctx.db.insert("analysisRuns", running);
    await ctx.db.patch("pullRequests", pullRequestId, {
      latestAnalysisRunId: analysisRunId,
      title: args.pullRequest.title,
      headSha: args.pullRequest.headSha,
      headRef: args.pullRequest.headRef,
      baseRef: args.pullRequest.baseRef,
      htmlUrl: args.pullRequest.htmlUrl,
    });
    return { kind: "ready" as const, analysisRunId, pullRequestId };
  },
});

export const markPhase = internalMutation({
  args: {
    analysisRunId: v.id("analysisRuns"),
    phase: v.union(v.literal("fetching_diff"), v.literal("evaluating")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("analysisRuns", args.analysisRunId);
    if (run === null || run.status === "completed" || run.status === "failed") {
      return null;
    }
    await ctx.db.replace("analysisRuns", args.analysisRunId, {
      webhookDeliveryId: run.webhookDeliveryId,
      repositoryId: run.repositoryId,
      pullRequestId: run.pullRequestId,
      githubAccountId: run.githubAccountId,
      headSha: run.headSha,
      status: "running",
      phase: args.phase,
    });
    return null;
  },
});

export const completeAnalysis = internalMutation({
  args: {
    analysisRunId: v.id("analysisRuns"),
    pullRequestId: v.id("pullRequests"),
    model: v.string(),
    sourceDiffBytes: v.number(),
    analyzedDiffBytes: v.number(),
    inputTruncated: v.boolean(),
    answers: v.array(
      v.object({
        slug: v.string(),
        question: v.string(),
        updatedAt: v.number(),
        answer: ruleAnswerValidator,
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("analysisRuns", args.analysisRunId);
    if (run === null || run.status !== "running") {
      return null;
    }
    const pull = await ctx.db.get("pullRequests", args.pullRequestId);
    if (pull?.latestAnalysisRunId !== args.analysisRunId) {
      await ctx.db.delete("analysisRuns", args.analysisRunId);
      return null;
    }
    let findingCount = 0;
    for (const evaluation of args.answers) {
      if (
        evaluation.answer.kind === "noul" &&
        !isNormalizedVector(evaluation.answer.vector)
      ) {
        throw new Error(
          `Refusing to store an invalid probability vector for ${evaluation.slug}.`,
        );
      }
      if (isFinding(evaluation.answer)) {
        findingCount += 1;
      }
      await ctx.db.insert("ruleEvaluations", {
        analysisRunId: args.analysisRunId,
        pullRequestId: args.pullRequestId,
        ruleSlug: evaluation.slug,
        ruleUpdatedAt: evaluation.updatedAt,
        question: evaluation.question,
        answer: evaluation.answer,
        model: args.model,
      });
    }
    await ctx.db.replace("analysisRuns", args.analysisRunId, {
      webhookDeliveryId: run.webhookDeliveryId,
      repositoryId: run.repositoryId,
      pullRequestId: run.pullRequestId,
      githubAccountId: run.githubAccountId,
      headSha: run.headSha,
      status: "completed",
      model: args.model,
      sourceDiffBytes: args.sourceDiffBytes,
      analyzedDiffBytes: args.analyzedDiffBytes,
      inputTruncated: args.inputTruncated,
      findingCount,
      completedAt: Date.now(),
    });
    await ctx.db.patch("pullRequests", args.pullRequestId, {
      latestAnalysisRunId: args.analysisRunId,
    });
    return null;
  },
});

export const failAnalysis = internalMutation({
  args: {
    analysisRunId: v.id("analysisRuns"),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get("analysisRuns", args.analysisRunId);
    if (run === null || run.status === "completed" || run.status === "failed") {
      return null;
    }
    await ctx.db.replace("analysisRuns", args.analysisRunId, {
      webhookDeliveryId: run.webhookDeliveryId,
      repositoryId: run.repositoryId,
      pullRequestId: run.pullRequestId,
      githubAccountId: run.githubAccountId,
      headSha: run.headSha,
      status: "failed",
      errorMessage: args.errorMessage,
    });
    return null;
  },
});

export const failRefresh = internalMutation({
  args: {
    pullRequestId: v.id("pullRequests"),
    ruleId: v.id("rules"),
    updatedAt: v.number(),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [pull, rule] = await Promise.all([
      ctx.db.get("pullRequests", args.pullRequestId),
      ctx.db.get("rules", args.ruleId),
    ]);
    if (
      pull === null ||
      rule === null ||
      pull.githubAccountId !== rule.githubAccountId ||
      rule.updatedAt !== args.updatedAt
    )
      return null;
    const latest =
      pull.latestAnalysisRunId === null
        ? null
        : await ctx.db.get("analysisRuns", pull.latestAnalysisRunId);
    if (latest?.status === "queued" || latest?.status === "running")
      return null;
    if (latest?.status === "completed") {
      const results = await ctx.db
        .query("ruleEvaluations")
        .withIndex("by_analysisRunId", (q) => q.eq("analysisRunId", latest._id))
        .take(64);
      if (
        results.some(
          (result) =>
            result.ruleSlug === rule.slug &&
            result.ruleUpdatedAt === rule.updatedAt,
        )
      )
        return null;
    }
    for await (const evaluation of ctx.db
      .query("ruleEvaluations")
      .withIndex("by_pullRequestId", (q) => q.eq("pullRequestId", pull._id))) {
      await ctx.db.delete("ruleEvaluations", evaluation._id);
    }
    for await (const previous of ctx.db
      .query("analysisRuns")
      .withIndex("by_pullRequestId", (q) => q.eq("pullRequestId", pull._id))) {
      await ctx.db.delete("analysisRuns", previous._id);
    }
    const id = await ctx.db.insert("analysisRuns", {
      webhookDeliveryId: null,
      repositoryId: pull.repositoryId,
      pullRequestId: pull._id,
      githubAccountId: pull.githubAccountId,
      headSha: pull.headSha,
      status: "failed",
      errorMessage: args.errorMessage,
    });
    await ctx.db.patch("pullRequests", pull._id, { latestAnalysisRunId: id });
    return null;
  },
});

function identity(delivery: Doc<"webhookDeliveries">) {
  return {
    githubDeliveryId: delivery.githubDeliveryId,
    event: delivery.event,
  };
}

async function upsertInstallation(
  ctx: MutationCtx,
  installation: {
    githubInstallationId: number;
    githubAccountId: number;
    accountLogin: string;
    accountType: string;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("installations")
    .withIndex("by_githubInstallationId", (q) =>
      q.eq("githubInstallationId", installation.githubInstallationId),
    )
    .unique();
  if (existing === null) {
    await ctx.db.insert("installations", installation);
    return;
  }
  await ctx.db.patch("installations", existing._id, {
    githubAccountId: installation.githubAccountId,
    accountLogin:
      installation.accountLogin.length > 0
        ? installation.accountLogin
        : existing.accountLogin,
    accountType:
      installation.accountType.length > 0
        ? installation.accountType
        : existing.accountType,
  });
}

async function upsertRepository(
  ctx: MutationCtx,
  repository: RepositoryRef & {
    githubInstallationId: number;
    githubAccountId: number;
    installed: boolean;
  },
): Promise<Id<"repositories">> {
  const existing = await ctx.db
    .query("repositories")
    .withIndex("by_githubRepoId", (q) =>
      q.eq("githubRepoId", repository.githubRepoId),
    )
    .unique();
  if (existing === null) {
    return await ctx.db.insert("repositories", {
      ...repository,
      pullRequestCount: 0,
    });
  }
  await ctx.db.patch("repositories", existing._id, {
    githubInstallationId: repository.githubInstallationId,
    githubAccountId: repository.githubAccountId,
    owner: repository.owner,
    name: repository.name,
    fullName: repository.fullName,
    private: repository.private,
    htmlUrl: repository.htmlUrl,
    defaultBranch: repository.defaultBranch,
    installed: repository.installed,
    pullRequestCount:
      existing.githubAccountId === repository.githubAccountId
        ? existing.pullRequestCount
        : 0,
  });
  return existing._id;
}

async function upsertPullRequest(
  ctx: MutationCtx,
  repositoryId: Id<"repositories">,
  githubAccountId: number,
  pullRequest: PullRequestRef,
): Promise<Id<"pullRequests">> {
  const existing = await ctx.db
    .query("pullRequests")
    .withIndex("by_repositoryId_and_githubPullNumber", (q) =>
      q
        .eq("repositoryId", repositoryId)
        .eq("githubPullNumber", pullRequest.githubPullNumber),
    )
    .unique();
  if (existing === null) {
    const repository = await ctx.db.get("repositories", repositoryId);
    if (repository !== null) {
      await ctx.db.patch("repositories", repositoryId, {
        pullRequestCount: repository.pullRequestCount + 1,
      });
    }
    return await ctx.db.insert("pullRequests", {
      repositoryId,
      githubAccountId,
      ...pullRequest,
      latestAnalysisRunId: null,
    });
  }
  if (existing.githubAccountId !== githubAccountId) {
    const repository = await ctx.db.get("repositories", repositoryId);
    if (repository !== null)
      await ctx.db.patch("repositories", repositoryId, {
        pullRequestCount: repository.pullRequestCount + 1,
      });
    await ctx.db.patch("pullRequests", existing._id, {
      ...pullRequest,
      githubAccountId,
      latestAnalysisRunId: null,
    });
    return existing._id;
  }
  await ctx.db.patch("pullRequests", existing._id, {
    ...pullRequest,
    githubAccountId,
  });
  return existing._id;
}

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { action, env, internalAction } from "./_generated/server";
import {
  createInstallationAccessToken,
  fetchAppSlug,
  findPersonalInstallation,
  fetchInstallation,
  fetchPullRequestDiff,
  fetchPullRequestMetadata,
  listInstallationRepositories,
  type InstallationRepository,
} from "./model/githubApi";
import { createGitHubAppJwt } from "./model/githubApp";
import {
  analyzesPullRequest,
  type DeliveryEvent,
  type PullRequestRef,
  type RepositoryRef,
} from "./model/githubEvents";
import { evaluateRulesWithJev } from "./model/jev";
import { evaluationState } from "./model/state";

export const processDelivery = internalAction({
  args: {
    deliveryId: v.id("webhookDeliveries"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await processDeliveryHandler(ctx, args.deliveryId);
    return null;
  },
});

export const refreshPull = internalAction({
  args: {
    pullRequestId: v.id("pullRequests"),
    ruleId: v.id("rules"),
    updatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await refreshPullHandler(ctx, args);
    return null;
  },
});

export const rerunPullRequest = action({
  args: { owner: v.string(), name: v.string(), pullNumber: v.number() },
  returns: v.union(v.literal("started"), v.literal("unavailable")),
  handler: async (ctx, args) => {
    const githubAccountId = await ctx.runQuery(internal.account.check, {});
    if (githubAccountId === null) return "unavailable" as const;
    const target = await ctx.runQuery(internal.rules.rerunTarget, {
      ...args,
      githubAccountId,
    });
    if (target === null) return "unavailable" as const;
    await refreshPullHandler(ctx, target);
    return "started" as const;
  },
});

async function refreshPullHandler(
  ctx: ActionCtx,
  args: {
    pullRequestId: Id<"pullRequests">;
    ruleId: Id<"rules">;
    updatedAt: number;
  },
): Promise<void> {
  const target = await ctx.runQuery(internal.rules.refreshTarget, args);
  if (target === null) return;
  let resolved: Awaited<ReturnType<typeof verifiedInstallation>>;
  let accessToken: string;
  let metadata: { repository: RepositoryRef; pullRequest: PullRequestRef };
  try {
    resolved = await verifiedInstallation(target.githubInstallationId);
    if (resolved.accountType !== "User") return;
    const token = await installationToken(target.githubInstallationId);
    if (!token.ok) throw new Error(token.message);
    accessToken = token.value;
    const fetched = await fetchPullRequestMetadata(
      fetch,
      accessToken,
      target.owner,
      target.name,
      target.pullNumber,
    );
    if (!fetched.ok) throw new Error(fetched.message);
    metadata = fetched.value;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not refresh the pull request.";
    await ctx.runMutation(internal.webhooks.failRefresh, {
      ...args,
      errorMessage: message,
    });
    throw error;
  }
  await runAnalysis(ctx, null, resolved, metadata, accessToken);
}

export const prepareInstallation = action({
  args: {},
  returns: v.union(
    v.object({ kind: v.literal("install"), url: v.string() }),
    v.object({ kind: v.literal("connected") }),
    v.object({ kind: v.literal("unauthenticated") }),
    v.object({ kind: v.literal("unavailable") }),
  ),
  handler: async (ctx) => {
    const githubAccountId: number | null = await ctx.runQuery(
      internal.account.check,
      {},
    );
    if (githubAccountId === null) return { kind: "unauthenticated" as const };
    const appId = present(env.GITHUB_APP_ID);
    const privateKey = present(env.GITHUB_PRIVATE_KEY);
    if (appId === null || privateKey === null)
      return { kind: "unavailable" as const };
    const jwt = await createGitHubAppJwt(
      appId,
      privateKey,
      Math.floor(Date.now() / 1000),
    );
    const app = await fetchAppSlug(fetch, jwt);
    if (!app.ok) return { kind: "unavailable" as const };
    const existing = await findPersonalInstallation(
      fetch,
      jwt,
      githubAccountId,
    );
    if (existing.ok && existing.value !== null) {
      await ctx.runMutation(internal.webhooks.recordInstallation, {
        installation: existing.value,
      });
      try {
        await syncInstallation(ctx, existing.value);
      } catch {
        /* Manual Sync remains available. */
      }
      return { kind: "connected" as const };
    }
    return {
      kind: "install" as const,
      url: `https://github.com/apps/${app.value}/installations/new`,
    };
  },
});

export const syncRepositories = action({
  args: {},
  returns: v.union(
    v.object({ kind: v.literal("synced"), repositoryCount: v.number() }),
    v.object({ kind: v.literal("unauthenticated") }),
    v.object({ kind: v.literal("no_installation") }),
    v.object({
      kind: v.literal("missing_credentials"),
      missing: v.array(v.string()),
    }),
    v.object({ kind: v.literal("github_error"), message: v.string() }),
  ),
  handler: async (ctx) => {
    const githubAccountId: number | null = await ctx.runQuery(
      internal.account.check,
      {},
    );
    if (githubAccountId === null) {
      return { kind: "unauthenticated" as const };
    }
    const missing = missingAppCredentials();
    if (missing.length > 0) {
      return { kind: "missing_credentials" as const, missing };
    }
    const installations = await ctx.runQuery(
      internal.webhooks.installationsForAccount,
      { githubAccountId },
    );
    if (installations.length === 0) {
      return { kind: "no_installation" as const };
    }
    let repositoryCount = 0;
    for (const installation of installations) {
      if (installation.accountType !== "User") continue;
      try {
        repositoryCount += await syncInstallation(ctx, installation);
      } catch (error) {
        return {
          kind: "github_error" as const,
          message:
            error instanceof Error ? error.message : "GitHub sync failed.",
        };
      }
    }
    return { kind: "synced" as const, repositoryCount };
  },
});

async function processDeliveryHandler(
  ctx: ActionCtx,
  deliveryId: Id<"webhookDeliveries">,
): Promise<void> {
  const claim = await ctx.runMutation(internal.webhooks.claim, {
    deliveryId,
  });
  if (claim.kind !== "claimed") {
    return;
  }
  const delivery = await ctx.runQuery(internal.webhooks.getDelivery, {
    deliveryId,
  });
  if (delivery === null) {
    return;
  }
  try {
    const event = delivery.event;
    if (event.kind === "ping" || event.kind === "ignored") {
      await ctx.runMutation(internal.webhooks.markProcessed, {
        deliveryId,
        outcome: "ignored",
      });
      return;
    }
    if (event.kind === "push") {
      await ctx.runMutation(internal.webhooks.markProcessed, {
        deliveryId,
        outcome: "push_recorded",
      });
      return;
    }
    if (
      event.kind === "installation" ||
      event.kind === "installation_repositories"
    ) {
      if (event.kind === "installation" && event.action === "deleted") {
        await ctx.runMutation(internal.webhooks.removeInstallation, {
          githubInstallationId: event.installationId,
        });
      } else {
        const installation = await verifiedInstallation(event.installationId);
        await ctx.runMutation(internal.webhooks.recordInstallation, {
          installation,
        });
        if (installation.accountType === "User") {
          await syncInstallation(ctx, installation);
        }
      }
      await ctx.runMutation(internal.webhooks.markProcessed, {
        deliveryId,
        outcome: "installation_recorded",
      });
      return;
    }
    if (!analyzesPullRequest(event.action)) {
      await ctx.runMutation(internal.webhooks.markProcessed, {
        deliveryId,
        outcome: "ignored",
      });
      return;
    }
    await analyzePullRequest(ctx, deliveryId, event);
    await ctx.runMutation(internal.webhooks.markProcessed, {
      deliveryId,
      outcome: "analyzed",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook processing failed.";
    await ctx.runMutation(internal.webhooks.markFailed, {
      deliveryId,
      errorMessage: message,
    });
  }
}

async function analyzePullRequest(
  ctx: ActionCtx,
  deliveryId: Id<"webhookDeliveries">,
  event: Extract<DeliveryEvent, { kind: "pull_request" }>,
): Promise<void> {
  if (event.installationId === null)
    throw new Error("Pull request webhook omitted installation id.");
  const resolved = await verifiedInstallation(event.installationId);
  const missing = missingAppCredentials();
  if (missing.length > 0) {
    throw new Error(`Missing ${missing.join(", ")}.`);
  }
  const token = await installationToken(resolved.githubInstallationId);
  if (!token.ok) throw new Error(token.message);
  const [owner, name] = event.repository.split("/");
  if (!owner || !name) throw new Error("Invalid repository name in delivery.");
  const metadata = await fetchPullRequestMetadata(
    fetch,
    token.value,
    owner,
    name,
    event.pullNumber,
  );
  if (!metadata.ok) throw new Error(metadata.message);
  await runAnalysis(ctx, deliveryId, resolved, metadata.value, token.value);
}

async function runAnalysis(
  ctx: ActionCtx,
  deliveryId: Id<"webhookDeliveries"> | null,
  resolved: Awaited<ReturnType<typeof verifiedInstallation>>,
  metadata: { repository: RepositoryRef; pullRequest: PullRequestRef },
  accessToken: string,
): Promise<void> {
  const { repository, pullRequest } = metadata;
  await ctx.runMutation(internal.webhooks.recordInstallation, {
    installation: resolved,
  });
  const begun = await ctx.runMutation(internal.webhooks.beginAnalysis, {
    deliveryId,
    githubInstallationId: resolved.githubInstallationId,
    githubAccountId: resolved.githubAccountId,
    repository,
    pullRequest,
  });
  if (begun.kind === "already_completed") {
    return;
  }
  try {
    const apiKey = present(env.TYPESAFE_API_KEY);
    if (apiKey === null) throw new Error("Missing TYPESAFE_API_KEY.");
    const diff = await fetchPullRequestDiff(
      fetch,
      accessToken,
      repository.owner,
      repository.name,
      pullRequest.githubPullNumber,
    );
    if (!diff.ok) {
      throw new Error(diff.message);
    }
    await ctx.runMutation(internal.webhooks.markPhase, {
      analysisRunId: begun.analysisRunId,
      phase: "evaluating",
    });
    const rules =
      resolved.accountType === "User"
        ? await ctx.runQuery(internal.rules.activeRules, {
            githubAccountId: resolved.githubAccountId,
          })
        : [];
    if (rules.length === 0) {
      await ctx.runMutation(internal.webhooks.completeAnalysis, {
        analysisRunId: begun.analysisRunId,
        pullRequestId: begun.pullRequestId,
        model: "none",
        sourceDiffBytes: 0,
        analyzedDiffBytes: 0,
        inputTruncated: false,
        answers: [],
      });
      return;
    }
    const state = evaluationState({
      repository: repository.fullName,
      pullNumber: pullRequest.githubPullNumber,
      title: pullRequest.title,
      diff: diff.value,
    });
    const evaluation = await evaluateRulesWithJev(apiKey, state, rules);
    if (!evaluation.ok) {
      throw new Error(evaluation.message);
    }
    await ctx.runMutation(internal.webhooks.completeAnalysis, {
      analysisRunId: begun.analysisRunId,
      pullRequestId: begun.pullRequestId,
      model: evaluation.model,
      sourceDiffBytes: new TextEncoder().encode(diff.value).length,
      analyzedDiffBytes: new TextEncoder().encode(state.diff).length,
      inputTruncated: state.diff_note !== undefined,
      answers: evaluation.answers,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analysis failed.";
    await ctx.runMutation(internal.webhooks.failAnalysis, {
      analysisRunId: begun.analysisRunId,
      errorMessage: message,
    });
    throw new Error(message);
  }
}

async function verifiedInstallation(installationId: number) {
  const appId = present(env.GITHUB_APP_ID);
  const privateKey = present(env.GITHUB_PRIVATE_KEY);
  if (appId === null || privateKey === null)
    throw new Error("Missing GitHub App credentials.");
  const jwt = await createGitHubAppJwt(
    appId,
    privateKey,
    Math.floor(Date.now() / 1000),
  );
  const result = await fetchInstallation(fetch, jwt, installationId);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

async function syncInstallation(
  ctx: ActionCtx,
  installation: {
    githubInstallationId: number;
    githubAccountId: number;
    accountLogin: string;
    accountType: string;
  },
): Promise<number> {
  const token = await installationToken(installation.githubInstallationId);
  if (!token.ok) throw new Error(token.message);
  const repositories = await listInstallationRepositories(fetch, token.value);
  if (!repositories.ok) throw new Error(repositories.message);
  return await ctx.runMutation(internal.webhooks.saveRepositories, {
    installation,
    repositories: repositories.value.map(repositoryForStorage),
  });
}

function missingAppCredentials(): string[] {
  const missing: string[] = [];
  if (present(env.GITHUB_APP_ID) === null) {
    missing.push("GITHUB_APP_ID");
  }
  if (present(env.GITHUB_PRIVATE_KEY) === null) {
    missing.push("GITHUB_PRIVATE_KEY");
  }
  return missing;
}

async function installationToken(installationId: number) {
  const appId = present(env.GITHUB_APP_ID);
  const privateKey = present(env.GITHUB_PRIVATE_KEY);
  if (appId === null || privateKey === null) {
    return {
      ok: false as const,
      message: "Missing GITHUB_APP_ID or GITHUB_PRIVATE_KEY.",
    };
  }
  const jwt = await createGitHubAppJwt(
    appId,
    privateKey,
    Math.floor(Date.now() / 1000),
  );
  return await createInstallationAccessToken(fetch, jwt, installationId);
}

function present(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  return value;
}

function repositoryForStorage(repository: InstallationRepository) {
  return {
    githubRepoId: repository.githubRepoId,
    owner: repository.owner,
    name: repository.name,
    fullName: repository.fullName,
    private: repository.private,
    htmlUrl: repository.htmlUrl,
    defaultBranch: repository.defaultBranch,
  };
}

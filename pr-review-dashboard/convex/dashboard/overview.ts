import { v } from "convex/values";
import { query } from "../_generated/server";
import { githubUserId } from "../model/account";
import { LIST_LIMIT, repositorySummaryValidator } from "./shared";

export const get = query({
  args: {},
  returns: v.union(
    v.object({ kind: v.literal("unauthenticated") }),
    v.object({
      kind: v.literal("ready"),
      installations: v.array(
        v.object({
          githubInstallationId: v.number(),
          accountLogin: v.string(),
          accountType: v.string(),
        }),
      ),
      repositories: v.array(repositorySummaryValidator),
      analysisActivity: v.object({ inProgressCount: v.number() }),
    }),
  ),
  handler: async (ctx) => {
    const githubAccountId = await githubUserId(ctx);
    if (githubAccountId === null) {
      return { kind: "unauthenticated" as const };
    }
    const installation = await ctx.db
      .query("installations")
      .withIndex("by_githubAccountId", (q) =>
        q.eq("githubAccountId", githubAccountId),
      )
      .collect();
    const repositories = await ctx.db
      .query("repositories")
      .withIndex("by_githubAccountId_and_installed", (q) =>
        q.eq("githubAccountId", githubAccountId).eq("installed", true),
      )
      .order("desc")
      .take(LIST_LIMIT);
    const [queuedRuns, runningRuns] = await Promise.all([
      ctx.db
        .query("analysisRuns")
        .withIndex("by_githubAccountId_and_status", (q) =>
          q.eq("githubAccountId", githubAccountId).eq("status", "queued"),
        )
        .take(LIST_LIMIT),
      ctx.db
        .query("analysisRuns")
        .withIndex("by_githubAccountId_and_status", (q) =>
          q.eq("githubAccountId", githubAccountId).eq("status", "running"),
        )
        .take(LIST_LIMIT),
    ]);
    return {
      kind: "ready" as const,
      installations: installation
        .filter((item) => item.accountType === "User")
        .map(({ githubInstallationId, accountLogin, accountType }) => ({
          githubInstallationId,
          accountLogin,
          accountType,
        })),
      repositories: repositories
        .filter((repository) => repository.installed)
        .map((repository) => ({
          owner: repository.owner,
          name: repository.name,
          fullName: repository.fullName,
          private: repository.private,
          htmlUrl: repository.htmlUrl,
          defaultBranch: repository.defaultBranch,
          pullRequestCount: repository.pullRequestCount,
        })),
      analysisActivity: {
        inProgressCount: queuedRuns.length + runningRuns.length,
      },
    };
  },
});

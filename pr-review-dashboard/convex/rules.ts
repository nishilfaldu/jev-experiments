import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { githubUserId } from "./model/account";
import { cleanRuleContent, ruleContentValidator } from "./model/rules";

const ruleFields = {
  slug: v.string(),
  content: ruleContentValidator,
};
const storedRule = v.object({
  ...ruleFields,
  _id: v.id("rules"),
  updatedAt: v.number(),
  active: v.boolean(),
});

export const list = query({
  args: {},
  returns: v.array(storedRule),
  handler: async (ctx) => {
    const githubAccountId = await githubUserId(ctx);
    if (githubAccountId === null) return [];
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_githubAccountId_and_slug", (q) =>
        q.eq("githubAccountId", githubAccountId),
      )
      .take(100);
    return rules.map(({ _id, slug, content, updatedAt, active }) => ({
      _id,
      slug,
      content,
      updatedAt,
      active,
    }));
  },
});

export const create = mutation({
  args: ruleFields,
  returns: v.id("rules"),
  handler: async (ctx, args) => {
    const githubAccountId = await githubUserId(ctx);
    if (githubAccountId === null)
      throw new Error("Sign in with GitHub to edit rules.");
    if (
      (
        await ctx.db
          .query("rules")
          .withIndex("by_githubAccountId_and_slug", (q) =>
            q.eq("githubAccountId", githubAccountId),
          )
          .take(64)
      ).length >= 64
    )
      throw new Error("This account supports up to 64 rules.");
    const slug = args.slug.trim();
    if (slug.length === 0 || slug.length > 1000)
      throw new Error("Slug must be 1–1000 characters.");
    if (!/^[a-z][a-z0-9_]*$/.test(slug))
      throw new Error(
        "Slug must use lowercase letters, numbers, and underscores.",
      );
    const existing = await ctx.db
      .query("rules")
      .withIndex("by_githubAccountId_and_slug", (q) =>
        q.eq("githubAccountId", githubAccountId).eq("slug", slug),
      )
      .unique();
    if (existing !== null)
      throw new Error("A rule with that slug already exists.");
    const updatedAt = Date.now();
    const id = await ctx.db.insert("rules", {
      githubAccountId,
      slug,
      content: cleanRuleContent(args.content),
      updatedAt,
      active: true,
    });
    await ctx.scheduler.runAfter(0, internal.rules.refreshBatch, {
      githubAccountId,
      ruleId: id,
      updatedAt,
      cursor: null,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    id: v.id("rules"),
    content: ruleContentValidator,
    active: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const githubAccountId = await githubUserId(ctx);
    if (githubAccountId === null)
      throw new Error("Sign in with GitHub to edit rules.");
    const rule = await ctx.db.get("rules", args.id);
    if (rule === null || rule.githubAccountId !== githubAccountId)
      throw new Error("Rule not found.");
    const next = {
      content: cleanRuleContent(args.content),
      active: args.active,
    };
    const before = rule.content;
    const after = next.content;
    const changed = JSON.stringify(before) !== JSON.stringify(after);
    const previousUpdatedAt = rule.updatedAt;
    const updatedAt =
      changed || next.active !== rule.active
        ? Math.max(Date.now(), previousUpdatedAt + 1)
        : previousUpdatedAt;
    if (changed)
      await ctx.db.insert("ruleEdits", {
        ruleId: args.id,
        before,
        after,
        editedAt: updatedAt,
      });
    await ctx.db.patch("rules", args.id, { ...next, updatedAt });
    if (changed || next.active !== rule.active) {
      await ctx.scheduler.runAfter(0, internal.rules.refreshBatch, {
        githubAccountId,
        ruleId: args.id,
        updatedAt,
        cursor: null,
      });
    }
    return null;
  },
});

export const editHistory = query({
  args: { id: v.id("rules") },
  returns: v.array(
    v.object({
      _id: v.id("ruleEdits"),
      editedAt: v.number(),
      before: ruleContentValidator,
      after: ruleContentValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const githubAccountId = await githubUserId(ctx);
    if (githubAccountId === null) return [];
    const rule = await ctx.db.get("rules", args.id);
    if (rule === null || rule.githubAccountId !== githubAccountId) return [];
    const edits = await ctx.db
      .query("ruleEdits")
      .withIndex("by_ruleId", (q) => q.eq("ruleId", args.id))
      .order("desc")
      .take(100);
    return edits.map(({ _id, editedAt, before, after }) => ({
      _id,
      editedAt,
      before,
      after,
    }));
  },
});

export const activeRules = internalQuery({
  args: { githubAccountId: v.number() },
  returns: v.array(v.object({ ...ruleFields, updatedAt: v.number() })),
  handler: async (ctx, args) => {
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_githubAccountId_and_slug", (q) =>
        q.eq("githubAccountId", args.githubAccountId),
      )
      .take(100);
    return rules
      .filter((rule) => rule.active)
      .map(({ slug, content, updatedAt }) => ({ slug, content, updatedAt }));
  },
});

export const refreshBatch = internalMutation({
  args: {
    githubAccountId: v.number(),
    ruleId: v.id("rules"),
    updatedAt: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rule = await ctx.db.get("rules", args.ruleId);
    if (
      rule === null ||
      rule.githubAccountId !== args.githubAccountId ||
      rule.updatedAt !== args.updatedAt
    )
      return null;
    const page = await ctx.db
      .query("pullRequests")
      .withIndex("by_githubAccountId", (q) =>
        q.eq("githubAccountId", args.githubAccountId),
      )
      .paginate({ numItems: 25, cursor: args.cursor });
    for (const pull of page.page) {
      await ctx.scheduler.runAfter(0, internal.analysis.refreshPull, {
        pullRequestId: pull._id,
        ruleId: args.ruleId,
        updatedAt: args.updatedAt,
      });
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.rules.refreshBatch, {
        ...args,
        cursor: page.continueCursor,
      });
    return null;
  },
});

export const refreshTarget = internalQuery({
  args: {
    pullRequestId: v.id("pullRequests"),
    ruleId: v.id("rules"),
    updatedAt: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({
      githubInstallationId: v.number(),
      owner: v.string(),
      name: v.string(),
      pullNumber: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const [pull, rule] = await Promise.all([
      ctx.db.get("pullRequests", args.pullRequestId),
      ctx.db.get("rules", args.ruleId),
    ]);
    if (
      pull === null ||
      rule === null ||
      rule.updatedAt !== args.updatedAt ||
      pull.githubAccountId !== rule.githubAccountId
    )
      return null;
    const repo = await ctx.db.get("repositories", pull.repositoryId);
    if (
      repo === null ||
      !repo.installed ||
      repo.githubAccountId !== rule.githubAccountId
    )
      return null;
    return {
      githubInstallationId: repo.githubInstallationId,
      owner: repo.owner,
      name: repo.name,
      pullNumber: pull.githubPullNumber,
    };
  },
});

export const rerunTarget = internalQuery({
  args: {
    githubAccountId: v.number(),
    owner: v.string(),
    name: v.string(),
    pullNumber: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({
      pullRequestId: v.id("pullRequests"),
      ruleId: v.id("rules"),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const repo = await ctx.db
      .query("repositories")
      .withIndex("by_fullName", (q) =>
        q.eq("fullName", `${args.owner}/${args.name}`),
      )
      .unique();
    if (
      repo === null ||
      !repo.installed ||
      repo.githubAccountId !== args.githubAccountId
    )
      return null;
    const pull = await ctx.db
      .query("pullRequests")
      .withIndex("by_repositoryId_and_githubPullNumber", (q) =>
        q.eq("repositoryId", repo._id).eq("githubPullNumber", args.pullNumber),
      )
      .unique();
    if (pull === null || pull.githubAccountId !== args.githubAccountId)
      return null;
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_githubAccountId_and_slug", (q) =>
        q.eq("githubAccountId", args.githubAccountId),
      )
      .take(64);
    const rule = rules.find((candidate) => candidate.active);
    if (rule === undefined) return null;
    return {
      pullRequestId: pull._id,
      ruleId: rule._id,
      updatedAt: rule.updatedAt,
    };
  },
});

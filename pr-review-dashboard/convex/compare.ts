import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { action, env, internalQuery } from "./_generated/server";
import { githubUserId } from "./model/account";
import { createGitHubAppJwt } from "./model/githubApp";
import {
  createInstallationAccessToken,
  fetchPullRequestDiff,
  fetchPullRequestMetadata,
} from "./model/githubApi";
import { evaluateRulesWithJev } from "./model/jev";
import {
  cleanRuleContent,
  ruleAnswerValidator,
  ruleContentValidator,
  type RuleDefinition,
} from "./model/rules";
import { evaluationState } from "./model/state";
import { confidenceFromVector } from "./model/verdict";

const entryValidator = v.union(
  v.object({ kind: v.literal("rule"), key: v.string(), ruleId: v.id("rules") }),
  v.object({
    kind: v.literal("adhoc"),
    key: v.string(),
    content: ruleContentValidator,
  }),
);
const groupValidator = v.object({
  key: v.string(),
  label: v.string(),
  entries: v.array(entryValidator),
});
const resolvedGroupValidator = v.object({
  key: v.string(),
  label: v.string(),
  entryKeys: v.array(v.string()),
});
const resolvedEntryValidator = v.object({
  key: v.string(),
  label: v.string(),
  slug: v.string(),
  content: ruleContentValidator,
  updatedAt: v.number(),
});
const targetValidator = v.object({
  installationId: v.number(),
  githubRepoId: v.number(),
  githubPullId: v.number(),
  owner: v.string(),
  name: v.string(),
  pullNumber: v.number(),
  groups: v.array(resolvedGroupValidator),
  entries: v.array(resolvedEntryValidator),
});
type CompareTarget = Infer<typeof targetValidator>;
const compareResultValidator = v.object({
  model: v.string(),
  headSha: v.string(),
  sourceDiffBytes: v.number(),
  analyzedDiffBytes: v.number(),
  inputTruncated: v.boolean(),
  groups: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
      results: v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          question: v.string(),
          answer: ruleAnswerValidator,
          confidence: v.number(),
        }),
      ),
    }),
  ),
});
type CompareResult = Infer<typeof compareResultValidator>;

export const target = internalQuery({
  args: {
    owner: v.string(),
    name: v.string(),
    pullNumber: v.number(),
    groups: v.array(groupValidator),
  },
  returns: v.union(v.null(), targetValidator),
  handler: async (ctx, args) => {
    const accountId = await githubUserId(ctx);
    if (accountId === null) return null;
    const repo = await ctx.db
      .query("repositories")
      .withIndex("by_fullName", (q) =>
        q.eq("fullName", `${args.owner}/${args.name}`),
      )
      .unique();
    if (repo === null || !repo.installed || repo.githubAccountId !== accountId)
      return null;
    const pull = await ctx.db
      .query("pullRequests")
      .withIndex("by_repositoryId_and_githubPullNumber", (q) =>
        q.eq("repositoryId", repo._id).eq("githubPullNumber", args.pullNumber),
      )
      .unique();
    if (pull === null || pull.githubAccountId !== accountId) return null;
    const entries: Infer<typeof resolvedEntryValidator>[] = [];
    const groups: Infer<typeof resolvedGroupValidator>[] = [];
    for (const group of args.groups) {
      const entryKeys: string[] = [];
      for (const entry of group.entries) {
        const index = entries.length;
        entryKeys.push(entry.key);
        if (entry.kind === "adhoc") {
          entries.push({
            key: entry.key,
            label: entry.content.question.trim(),
            slug: `__compare_${index}`,
            content: cleanRuleContent(entry.content),
            updatedAt: 0,
          });
        } else {
          const rule = await ctx.db.get("rules", entry.ruleId);
          if (rule === null || rule.githubAccountId !== accountId)
            throw new Error("One of the selected rules is unavailable.");
          entries.push({
            key: entry.key,
            label: rule.slug,
            slug: `__compare_${index}`,
            content: rule.content,
            updatedAt: rule.updatedAt,
          });
        }
      }
      groups.push({ key: group.key, label: group.label.trim(), entryKeys });
    }
    return {
      installationId: repo.githubInstallationId,
      githubRepoId: repo.githubRepoId,
      githubPullId: pull.githubPullId,
      owner: repo.owner,
      name: repo.name,
      pullNumber: pull.githubPullNumber,
      groups,
      entries,
    };
  },
});

export const run = action({
  args: {
    owner: v.string(),
    name: v.string(),
    pullNumber: v.number(),
    groups: v.array(groupValidator),
  },
  returns: compareResultValidator,
  handler: async (ctx, args): Promise<CompareResult> => {
    if (
      args.groups.length === 0 ||
      args.groups.some((group) => group.entries.length === 0)
    )
      throw new Error("Every compare group needs at least one question.");
    if (
      args.groups.some(
        (group) =>
          group.key.length === 0 ||
          group.label.trim().length === 0 ||
          group.label.length > 100,
      ) ||
      new Set(args.groups.map((group) => group.key)).size !== args.groups.length
    )
      throw new Error("Compare groups need distinct names and keys.");
    const inputEntries = args.groups.flatMap((group) => group.entries);
    if (
      new Set(inputEntries.map((entry) => entry.key)).size !==
        inputEntries.length ||
      inputEntries.some((entry) => entry.key.length === 0)
    )
      throw new Error("Compare entries must be distinct.");
    const resolved: CompareTarget | null = await ctx.runQuery(
      internal.compare.target,
      args,
    );
    if (resolved === null) throw new Error("This pull request is unavailable.");
    const category = resolved.entries[0].content.kind;
    if (resolved.entries.some((entry) => entry.content.kind !== category))
      throw new Error("Compare entries must all use the same Jev category.");
    const appId = env.GITHUB_APP_ID?.trim();
    const privateKey = env.GITHUB_PRIVATE_KEY?.trim();
    const apiKey = env.TYPESAFE_API_KEY?.trim();
    if (!appId || !privateKey || !apiKey)
      throw new Error(
        "Compare is unavailable: GitHub or Jev credentials are missing.",
      );
    const jwt = await createGitHubAppJwt(
      appId,
      privateKey,
      Math.floor(Date.now() / 1000),
    );
    const token = await createInstallationAccessToken(
      fetch,
      jwt,
      resolved.installationId,
    );
    if (!token.ok) throw new Error(token.message);
    const [metadata, diff] = await Promise.all([
      fetchPullRequestMetadata(
        fetch,
        token.value,
        resolved.owner,
        resolved.name,
        resolved.pullNumber,
      ),
      fetchPullRequestDiff(
        fetch,
        token.value,
        resolved.owner,
        resolved.name,
        resolved.pullNumber,
      ),
    ]);
    if (!metadata.ok) throw new Error(metadata.message);
    if (!diff.ok) throw new Error(diff.message);
    if (
      metadata.value.repository.githubRepoId !== resolved.githubRepoId ||
      metadata.value.pullRequest.githubPullId !== resolved.githubPullId
    )
      throw new Error(
        "GitHub returned a different repository or pull request.",
      );
    const state = evaluationState({
      repository: metadata.value.repository.fullName,
      pullNumber: resolved.pullNumber,
      title: metadata.value.pullRequest.title,
      diff: diff.value,
    });
    const definitions: RuleDefinition[] = resolved.entries.map(
      ({ slug, content, updatedAt }) => ({ slug, content, updatedAt }),
    );
    const evaluation = await evaluateRulesWithJev(apiKey, state, definitions);
    if (!evaluation.ok) throw new Error(evaluation.message);
    const bytes = new TextEncoder();
    const results = evaluation.answers.map((answer, index) => ({
      key: resolved.entries[index].key,
      label: resolved.entries[index].label,
      question: answer.question,
      answer: answer.answer,
      confidence:
        answer.answer.kind === "noul"
          ? confidenceFromVector(answer.answer.vector)
          : answer.answer.confidence,
    }));
    const resultsByKey = new Map(results.map((result) => [result.key, result]));
    return {
      model: evaluation.model,
      headSha: metadata.value.pullRequest.headSha,
      sourceDiffBytes: bytes.encode(diff.value).length,
      analyzedDiffBytes: bytes.encode(state.diff).length,
      inputTruncated: state.diff_note !== undefined,
      groups: resolved.groups.map((group) => {
        const groupResults = group.entryKeys.map((key) => {
          const item = resultsByKey.get(key);
          if (item === undefined)
            throw new Error("Compare result was missing a question.");
          return item;
        });
        return { key: group.key, label: group.label, results: groupResults };
      }),
    };
  },
});

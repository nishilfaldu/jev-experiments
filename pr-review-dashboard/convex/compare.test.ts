/* eslint-disable @convex-dev/no-process-env -- test environment */
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}
const modules: Record<string, () => Promise<unknown>> = {};
for (const [path, loader] of Object.entries(import.meta.glob("./**/*.ts")))
  if (!path.includes(".test.")) modules[path] = loader;

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Owner" });
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "github",
      providerAccountId: "123",
    });
    const otherId = await ctx.db.insert("users", { name: "Other" });
    await ctx.db.insert("authAccounts", {
      userId: otherId,
      provider: "github",
      providerAccountId: "456",
    });
    const repositoryId = await ctx.db.insert("repositories", {
      githubInstallationId: 5,
      githubAccountId: 123,
      githubRepoId: 42,
      owner: "acme",
      name: "app",
      fullName: "acme/app",
      private: true,
      htmlUrl: "https://github.com/acme/app",
      defaultBranch: "main",
      pullRequestCount: 1,
      installed: true,
    });
    await ctx.db.insert("pullRequests", {
      repositoryId,
      githubAccountId: 123,
      githubPullNumber: 7,
      githubPullId: 99,
      title: "Change",
      htmlUrl: "https://github.com/acme/app/pull/7",
      authorLogin: "author",
      baseRef: "main",
      headRef: "work",
      headSha: "abcdef",
      latestAnalysisRunId: null,
    });
    const ruleId = await ctx.db.insert("rules", {
      githubAccountId: 123,
      slug: "risk",
      content: {
        kind: "noul",
        question: "Is there risk?",
        yesMeans: "Risk",
        noMeans: "No risk",
        valence: "violation",
      },
      updatedAt: 1,
      active: true,
    });
    const otherRuleId = await ctx.db.insert("rules", {
      githubAccountId: 456,
      slug: "private",
      content: {
        kind: "noul",
        question: "Private?",
        yesMeans: "Yes",
        noMeans: "No",
        valence: "informational",
      },
      updatedAt: 1,
      active: true,
    });
    return { userId, otherId, ruleId, otherRuleId };
  });
  return {
    t,
    owner: t.withIdentity({ subject: `${ids.userId}|session` }),
    other: t.withIdentity({ subject: `${ids.otherId}|session` }),
    ruleId: ids.ruleId,
    otherRuleId: ids.otherRuleId,
  };
}

const pr = { owner: "acme", name: "app", pullNumber: 7 };
const adhoc = {
  kind: "adhoc" as const,
  key: "temporary",
  content: {
    kind: "noul" as const,
    question: "Is this changed?",
    yesMeans: "Changed",
    noMeans: "Unchanged",
    valence: "informational" as const,
  },
};

test("compare rejects cross-account rules and mixed categories before external calls", async () => {
  const { owner, other, otherRuleId, ruleId } = await fixture();
  await expect(
    other.action(api.compare.run, {
      ...pr,
      groups: [{ key: "only", label: "Only", entries: [adhoc] }],
    }),
  ).rejects.toThrow("unavailable");
  await expect(
    owner.action(api.compare.run, {
      ...pr,
      groups: [
        {
          key: "only",
          label: "Only",
          entries: [{ kind: "rule", key: "foreign", ruleId: otherRuleId }],
        },
      ],
    }),
  ).rejects.toThrow("selected rules is unavailable");
  await expect(
    owner.action(api.compare.run, {
      ...pr,
      groups: [
        {
          key: "broad",
          label: "Broad",
          entries: [{ kind: "rule", key: "stored", ruleId }],
        },
        {
          key: "split",
          label: "Split",
          entries: [
            {
              kind: "adhoc",
              key: "score",
              content: {
                kind: "score",
                question: "How complex?",
                rubric: ["Low", "High"],
              },
            },
          ],
        },
      ],
    }),
  ).rejects.toThrow("same Jev category");
});

test("compare returns broad and split groups without changing stored data", async () => {
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_PRIVATE_KEY = await testPrivateKey();
  process.env.TYPESAFE_API_KEY = "test-key";
  const { t, owner, ruleId } = await fixture();
  const before = await t.run(async (ctx) => ({
    rules: await ctx.db.query("rules").take(10),
    evaluations: await ctx.db.query("ruleEvaluations").take(10),
    runs: await ctx.db.query("analysisRuns").take(10),
  }));
  const originalFetch = globalThis.fetch;
  let sentQuestions: string[] = [];
  let responseKind: "noul" | "choice" = "noul";
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/access_tokens")) return json({ token: "ghs_test" });
    if (url.endsWith("/repos/acme/app"))
      return json({
        id: 42,
        name: "app",
        full_name: "acme/app",
        private: true,
        html_url: "https://github.com/acme/app",
        default_branch: "main",
        owner: { login: "acme" },
      });
    if (url.endsWith("/pulls/7"))
      return new Headers(init?.headers).get("Accept") ===
        "application/vnd.github.diff"
        ? new Response("diff --git a/a b/a\n")
        : json({
            id: 99,
            number: 7,
            title: "Change",
            html_url: "https://github.com/acme/app/pull/7",
            user: { login: "author" },
            base: { ref: "main" },
            head: { ref: "work", sha: "abcdef" },
          });
    if (url.includes("api.typesafe.ai")) {
      const body = JSON.parse(String(init?.body)) as {
        questions: Record<string, unknown>;
      };
      sentQuestions = Object.keys(body.questions);
      if (responseKind === "choice")
        return json({
          model: "jev-test",
          answers: Object.fromEntries(
            sentQuestions.map((key) => [
              key,
              {
                type: "choice",
                choice: "tests",
                confidence: 0.8,
                probabilities: { auth: 0.2, tests: 0.8 },
              },
            ]),
          ),
        });
      return json({
        model: "jev-test",
        answers: {
          __compare_0: { type: "noul", noul: 0.4 },
          __compare_1: { type: "noul", noul: 0.2 },
          __compare_2: { type: "noul", noul: 0.7 },
          __compare_3: { type: "noul", noul: 0.1 },
        },
      });
    }
    return new Response("not found", { status: 404 });
  };
  try {
    const result = await owner.action(api.compare.run, {
      ...pr,
      groups: [
        {
          key: "broad",
          label: "Broad rule",
          entries: [{ kind: "rule", key: "stored", ruleId }],
        },
        {
          key: "split",
          label: "Three-question split",
          entries: [
            adhoc,
            {
              ...adhoc,
              key: "second",
              content: { ...adhoc.content, question: "Is there an error?" },
            },
            {
              ...adhoc,
              key: "third",
              content: { ...adhoc.content, question: "Is there a warning?" },
            },
          ],
        },
      ],
    });
    expect(sentQuestions).toEqual([
      "__compare_0",
      "__compare_1",
      "__compare_2",
      "__compare_3",
    ]);
    expect(result).toMatchObject({
      model: "jev-test",
      headSha: "abcdef",
      groups: [
        {
          key: "broad",
          label: "Broad rule",
          results: [
            {
              key: "stored",
              label: "risk",
              answer: { kind: "noul", vector: { yes: 0.4 } },
            },
          ],
        },
        {
          key: "split",
          label: "Three-question split",
          results: [
            { key: "temporary", label: "Is this changed?" },
            { key: "second", answer: { kind: "noul", vector: { yes: 0.7 } } },
            { key: "third" },
          ],
        },
      ],
    });
    responseKind = "choice";
    const choiceResult = await owner.action(api.compare.run, {
      ...pr,
      groups: [
        {
          key: "choice-group",
          label: "Two choices",
          entries: ["Which area?", "What else?"].map((question, index) => ({
            kind: "adhoc" as const,
            key: `choice-${index}`,
            content: {
              kind: "choice" as const,
              question,
              options: [
                { label: "auth", description: "Authentication" },
                { label: "tests", description: "Tests" },
              ],
            },
          })),
        },
      ],
    });
    expect(choiceResult.groups[0]?.results).toMatchObject([
      { key: "choice-0", answer: { kind: "choice", choice: "tests" } },
      { key: "choice-1", answer: { kind: "choice", choice: "tests" } },
    ]);
    const after = await t.run(async (ctx) => ({
      rules: await ctx.db.query("rules").take(10),
      evaluations: await ctx.db.query("ruleEvaluations").take(10),
      runs: await ctx.db.query("analysisRuns").take(10),
    }));
    expect(after).toEqual(before);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function testPrivateKey(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign"],
  );
  const bytes = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `-----BEGIN PRIVATE KEY-----\n${(btoa(binary).match(/.{1,64}/g) ?? []).join("\n")}\n-----END PRIVATE KEY-----\n`;
}
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

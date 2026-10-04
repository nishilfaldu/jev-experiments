/* eslint-disable @convex-dev/no-process-env -- test environment */
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { signGitHubBody } from "./model/githubSignature";

declare global {
  interface ImportMeta {
    glob(pattern: string): Record<string, () => Promise<unknown>>;
  }
}
const modules: Record<string, () => Promise<unknown>> = {};
for (const [path, loader] of Object.entries(import.meta.glob("./**/*.ts"))) {
  if (!path.includes(".test.")) modules[path] = loader;
}

const repository = {
  id: 42,
  name: "app",
  full_name: "acme/app",
  private: true,
  html_url: "https://github.com/acme/app",
  default_branch: "main",
  owner: { login: "acme" },
};
const pull = {
  id: 99,
  number: 7,
  title: "Change",
  html_url: "https://github.com/acme/app/pull/7",
  user: { login: "author" },
  base: { ref: "main" },
  head: { ref: "work", sha: "abcdef" },
};

async function owner(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Owner" });
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "github",
      providerAccountId: "123",
    });
    return userId;
  });
  return t.withIdentity({ subject: `${userId}|session` });
}

async function otherUser(t: ReturnType<typeof convexTest>) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Other" });
    await ctx.db.insert("authAccounts", {
      userId,
      provider: "github",
      providerAccountId: "456",
    });
    return userId;
  });
  return t.withIdentity({ subject: `${userId}|session` });
}

async function post(t: ReturnType<typeof convexTest>, id: string, number = 7) {
  const body = JSON.stringify({
    action: "opened",
    installation: { id: 5 },
    repository,
    pull_request: { ...pull, number },
  });
  const signature = await signGitHubBody(
    new TextEncoder().encode(body),
    "webhook-secret",
  );
  return await t.fetch("/github/webhook", {
    method: "POST",
    headers: {
      "x-github-event": "pull_request",
      "x-github-delivery": id,
      "x-hub-signature-256": signature,
    },
    body,
  });
}

async function postInstallation(
  t: ReturnType<typeof convexTest>,
  id: string,
  action = "created",
  eventName = "installation",
) {
  const body = JSON.stringify({
    action,
    installation: { id: 5, account: { id: 123, login: "owner", type: "User" } },
  });
  const signature = await signGitHubBody(
    new TextEncoder().encode(body),
    "webhook-secret",
  );
  return await t.fetch("/github/webhook", {
    method: "POST",
    headers: {
      "x-github-event": eventName,
      "x-github-delivery": id,
      "x-hub-signature-256": signature,
    },
    body,
  });
}

async function drain(t: ReturnType<typeof convexTest>) {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(() => {
      vi.advanceTimersByTime(1);
    });
  } finally {
    vi.useRealTimers();
  }
}

test("webhook stores only identifiers, evaluates custom valence, and exposes partial input", async () => {
  process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret";
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_PRIVATE_KEY = await testPrivateKey();
  process.env.TYPESAFE_API_KEY = "test-key";
  const t = convexTest(schema, modules);
  const authed = await owner(t);
  const intruder = t.withIdentity({ subject: "intruder|session" });
  const other = await otherUser(t);
  const riskRuleId = await authed.mutation(api.rules.create, {
    slug: "risk",
    content: {
      kind: "noul",
      question: "Is this risky?",
      yesMeans: "Risk",
      noMeans: "No risk",
      valence: "violation",
    },
  });
  await authed.mutation(api.rules.create, {
    slug: "feature",
    content: {
      kind: "noul",
      question: "Is this a feature?",
      yesMeans: "Feature",
      noMeans: "No feature",
      valence: "informational",
    },
  });
  expect(await intruder.query(api.rules.list, {})).toEqual([]);
  expect(await other.query(api.rules.list, {})).toEqual([]);
  await expect(
    other.mutation(api.rules.update, {
      id: riskRuleId,
      content: {
        kind: "noul",
        question: "Changed?",
        yesMeans: "Yes",
        noMeans: "No",
        valence: "violation",
      },
      active: false,
    }),
  ).rejects.toThrow("Rule not found");
  await other.mutation(api.rules.create, {
    slug: "risk",
    content: {
      kind: "noul",
      question: "My rule?",
      yesMeans: "Yes",
      noMeans: "No",
      valence: "informational",
    },
  });
  await expect(
    intruder.mutation(api.rules.create, {
      slug: "bad",
      content: {
        kind: "noul",
        question: "Bad?",
        yesMeans: "Yes",
        noMeans: "No",
        valence: "violation",
      },
    }),
  ).rejects.toThrow();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/app/installations/5"))
      return json({
        id: 5,
        account: { id: 123, login: "owner", type: "User" },
      });
    if (url.endsWith("/access_tokens")) return json({ token: "ghs_test" });
    if (url.endsWith("/repos/acme/app")) return json(repository);
    if (url.endsWith("/pulls/7")) {
      if (
        new Headers(init?.headers).get("Accept") ===
        "application/vnd.github.diff"
      )
        return new Response("a".repeat(60_025));
      return json(pull);
    }
    if (url.includes("api.typesafe.ai"))
      return json({
        model: "jev-test",
        answers: {
          risk: { type: "noul", noul: 0.9 },
          feature: { type: "noul", noul: 0.9 },
        },
      });
    return new Response("not found", { status: 404 });
  };
  try {
    expect((await post(t, "delivery-one")).status).toBe(202);
    const stored = await t.run(
      async (ctx) => (await ctx.db.query("webhookDeliveries").take(1))[0],
    );
    expect(stored?.event).toEqual({
      kind: "pull_request",
      action: "opened",
      installationId: 5,
      repository: "acme/app",
      pullNumber: 7,
    });
    expect(JSON.stringify(stored)).not.toContain('pull_request":{');
    await drain(t);
    const detail = await authed.query(api.dashboard.pullRequest.get, {
      owner: "acme",
      name: "app",
      pullNumber: 7,
    });
    expect(detail.kind).toBe("ready");
    if (detail.kind !== "ready" || detail.analysis.status !== "completed")
      throw new Error("analysis missing");
    expect(detail.analysis.findingCount).toBe(1);
    expect(detail.analysis.inputTruncated).toBe(true);
    expect(detail.analysis.sourceDiffBytes).toBe(60_025);
    expect(detail.analysis.analyzedDiffBytes).toBe(60_000);
    expect(
      detail.analysis.rules.find((rule) => rule.slug === "feature"),
    ).toMatchObject({ answer: { valence: "informational" }, finding: false });
    expect(
      (
        await intruder.query(api.dashboard.pullRequest.get, {
          owner: "acme",
          name: "app",
          pullNumber: 7,
        })
      ).kind,
    ).toBe("unauthenticated");
    expect(
      (
        await other.query(api.dashboard.pullRequest.get, {
          owner: "acme",
          name: "app",
          pullNumber: 7,
        })
      ).kind,
    ).toBe("not_found");
    expect(
      (
        await other.query(api.dashboard.repository.get, {
          owner: "acme",
          name: "app",
        })
      ).kind,
    ).toBe("not_found");
    expect((await other.query(api.dashboard.overview.get, {})).kind).toBe(
      "ready",
    );
    const otherOverview = await other.query(api.dashboard.overview.get, {});
    if (otherOverview.kind !== "ready")
      throw new Error("other overview missing");
    expect(otherOverview.repositories).toEqual([]);
    expect(otherOverview.installations).toEqual([]);
    expect(await other.action(api.analysis.syncRepositories, {})).toEqual({
      kind: "no_installation",
    });
    expect(await other.query(api.rules.list, {})).toMatchObject([
      { slug: "risk", content: { question: "My rule?" } },
    ]);
    expect((await post(t, "delivery-one")).status).toBe(202);
    expect(
      (await t.run(async (ctx) => ctx.db.query("analysisRuns").take(10)))
        .length,
    ).toBe(1);
    await authed.mutation(api.rules.update, {
      id: riskRuleId,
      content: {
        kind: "noul",
        question: "Does the diff introduce a risk?",
        yesMeans: "Risk",
        noMeans: "No risk",
        valence: "violation",
      },
      active: true,
    });
    expect(
      await other.query(api.rules.editHistory, { id: riskRuleId }),
    ).toEqual([]);
    const pending = await authed.query(api.dashboard.pullRequest.get, {
      owner: "acme",
      name: "app",
      pullNumber: 7,
    });
    expect(pending.kind === "ready" && pending.analysis.status).toBe("queued");
    const repositoryPending = await authed.query(api.dashboard.repository.get, {
      owner: "acme",
      name: "app",
    });
    expect(
      repositoryPending.kind === "ready" &&
        repositoryPending.pullRequests[0]?.analysis.status,
    ).toBe("queued");
    await drain(t);
    const refreshed = await authed.query(api.dashboard.pullRequest.get, {
      owner: "acme",
      name: "app",
      pullNumber: 7,
    });
    if (refreshed.kind !== "ready" || refreshed.analysis.status !== "completed")
      throw new Error("refresh missing");
    expect(
      refreshed.analysis.rules.find((rule) => rule.slug === "risk")?.question,
    ).toBe("Does the diff introduce a risk?");
    const currentEvaluations = await t.run(async (ctx) =>
      ctx.db.query("ruleEvaluations").take(10),
    );
    expect(currentEvaluations).toHaveLength(2);
    expect(
      currentEvaluations.some((item) => item.question === "Is this risky?"),
    ).toBe(false);
    expect(
      await other.action(api.analysis.rerunPullRequest, {
        owner: "acme",
        name: "app",
        pullNumber: 7,
      }),
    ).toBe("unavailable");
    expect(
      await authed.action(api.analysis.rerunPullRequest, {
        owner: "acme",
        name: "app",
        pullNumber: 7,
      }),
    ).toBe("started");
    expect(
      (await t.run(async (ctx) => ctx.db.query("analysisRuns").take(10)))
        .length,
    ).toBe(1);
    expect(
      (await t.run(async (ctx) => ctx.db.query("ruleEvaluations").take(10)))
        .length,
    ).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("editing a rule records prompt changes without versions and paused rules are excluded", async () => {
  const t = convexTest(schema, modules);
  const authed = await owner(t);
  const id = await authed.mutation(api.rules.create, {
    slug: "summary",
    content: {
      kind: "noul",
      question: "What changed?",
      yesMeans: "Changed",
      noMeans: "Unchanged",
      valence: "informational",
    },
  });
  await authed.mutation(api.rules.update, {
    id,
    content: {
      kind: "noul",
      question: "Did behavior change?",
      yesMeans: "Changed",
      noMeans: "Unchanged",
      valence: "violation",
    },
    active: false,
  });
  expect(await authed.query(api.rules.list, {})).toMatchObject([
    { slug: "summary", content: { valence: "violation" }, active: false },
  ]);
  expect(await authed.query(api.rules.editHistory, { id })).toMatchObject([
    {
      before: { question: "What changed?" },
      after: { question: "Did behavior change?" },
    },
  ]);
  expect(
    await t.query(internal.rules.activeRules, { githubAccountId: 123 }),
  ).toEqual([]);
});

test("install link is authenticated and the installation webhook discovers repositories", async () => {
  process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret";
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_PRIVATE_KEY = await testPrivateKey();
  const t = convexTest(schema, modules);
  const first = await owner(t);
  const second = await otherUser(t);
  const originalFetch = globalThis.fetch;
  let repositories = [repository];
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/app")) return json({ slug: "just-jevving" });
    if (url.includes("/app/installations?")) return json([]);
    if (url.endsWith("/app/installations/5"))
      return json({
        id: 5,
        account: { id: 123, login: "owner", type: "User" },
      });
    if (url.endsWith("/access_tokens")) return json({ token: "ghs_test" });
    if (url.includes("/installation/repositories"))
      return json({ repositories });
    return new Response("not found", { status: 404 });
  };
  try {
    expect(await first.action(api.analysis.prepareInstallation, {})).toEqual({
      kind: "install",
      url: "https://github.com/apps/just-jevving/installations/new",
    });
    expect(await t.action(api.analysis.prepareInstallation, {})).toEqual({
      kind: "unauthenticated",
    });
    expect((await postInstallation(t, "install-created")).status).toBe(202);
    await drain(t);
    const firstOverview = await first.query(api.dashboard.overview.get, {});
    const secondOverview = await second.query(api.dashboard.overview.get, {});
    if (firstOverview.kind !== "ready" || secondOverview.kind !== "ready")
      throw new Error("overview missing");
    expect(firstOverview.repositories.map((item) => item.fullName)).toEqual([
      "acme/app",
    ]);
    expect(secondOverview.repositories).toEqual([]);
    repositories = [];
    expect(
      (
        await postInstallation(
          t,
          "install-updated",
          "removed",
          "installation_repositories",
        )
      ).status,
    ).toBe(202);
    await drain(t);
    const updated = await first.query(api.dashboard.overview.get, {});
    if (updated.kind !== "ready") throw new Error("overview missing");
    expect(updated.repositories).toEqual([]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an existing personal installation reconnects on dashboard load without a new webhook", async () => {
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_PRIVATE_KEY = await testPrivateKey();
  const t = convexTest(schema, modules);
  const first = await owner(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/app")) return json({ slug: "just-jevving" });
    if (url.includes("/app/installations?"))
      return json([
        { id: 5, account: { id: 123, login: "owner", type: "User" } },
      ]);
    if (url.endsWith("/access_tokens")) return json({ token: "ghs_test" });
    if (url.includes("/installation/repositories"))
      return json({ repositories: [repository] });
    return new Response("not found", { status: 404 });
  };
  try {
    expect(await first.action(api.analysis.prepareInstallation, {})).toEqual({
      kind: "connected",
    });
    const overview = await first.query(api.dashboard.overview.get, {});
    if (overview.kind !== "ready") throw new Error("overview missing");
    expect(overview.installations).toHaveLength(1);
    expect(overview.repositories.map((item) => item.fullName)).toEqual([
      "acme/app",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed automatic discovery leaves an installation that manual sync can recover", async () => {
  process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret";
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_PRIVATE_KEY = await testPrivateKey();
  const t = convexTest(schema, modules);
  const first = await owner(t);
  let fail = true;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/app/installations/5"))
      return json({
        id: 5,
        account: { id: 123, login: "owner", type: "User" },
      });
    if (url.endsWith("/access_tokens")) return json({ token: "ghs_test" });
    if (url.includes("/installation/repositories"))
      return fail
        ? new Response("unavailable", { status: 503 })
        : json({ repositories: [repository] });
    return new Response("not found", { status: 404 });
  };
  try {
    await postInstallation(t, "install-retry");
    await drain(t);
    const before = await first.query(api.dashboard.overview.get, {});
    if (before.kind !== "ready") throw new Error("overview missing");
    expect(before.installations).toHaveLength(1);
    expect(before.repositories).toEqual([]);
    fail = false;
    expect(await first.action(api.analysis.syncRepositories, {})).toEqual({
      kind: "synced",
      repositoryCount: 1,
    });
    const after = await first.query(api.dashboard.overview.get, {});
    if (after.kind !== "ready") throw new Error("overview missing");
    expect(after.repositories.map((item) => item.fullName)).toEqual([
      "acme/app",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("two installation owners see only their own repositories", async () => {
  const t = convexTest(schema, modules);
  const first = await owner(t);
  const second = await otherUser(t);
  for (const [
    githubInstallationId,
    githubAccountId,
    githubRepoId,
    fullName,
  ] of [
    [5, 123, 42, "acme/app"],
    [6, 456, 43, "other/app"],
  ] as const) {
    await t.mutation(internal.webhooks.saveRepositories, {
      installation: {
        githubInstallationId,
        githubAccountId,
        accountLogin: fullName.split("/")[0],
        accountType: "User",
      },
      repositories: [
        {
          githubRepoId,
          owner: fullName.split("/")[0],
          name: "app",
          fullName,
          private: true,
          htmlUrl: `https://github.com/${fullName}`,
          defaultBranch: "main",
        },
      ],
    });
  }
  const firstOverview = await first.query(api.dashboard.overview.get, {});
  const secondOverview = await second.query(api.dashboard.overview.get, {});
  if (firstOverview.kind !== "ready" || secondOverview.kind !== "ready")
    throw new Error("overview missing");
  expect(firstOverview.repositories.map((repo) => repo.fullName)).toEqual([
    "acme/app",
  ]);
  expect(secondOverview.repositories.map((repo) => repo.fullName)).toEqual([
    "other/app",
  ]);
  expect(
    firstOverview.installations.map(
      (installation) => installation.githubInstallationId,
    ),
  ).toEqual([5]);
  expect(
    secondOverview.installations.map(
      (installation) => installation.githubInstallationId,
    ),
  ).toEqual([6]);
  expect(
    (
      await first.query(api.dashboard.repository.get, {
        owner: "other",
        name: "app",
      })
    ).kind,
  ).toBe("not_found");
  expect(
    (
      await second.query(api.dashboard.repository.get, {
        owner: "acme",
        name: "app",
      })
    ).kind,
  ).toBe("not_found");
  const deliveryId = await t.run((ctx) =>
    ctx.db.insert("webhookDeliveries", {
      githubDeliveryId: "old-account",
      event: {
        kind: "pull_request",
        action: "opened",
        installationId: 5,
        repository: "acme/app",
        pullNumber: 7,
      },
      status: "stored",
    }),
  );
  await t.mutation(internal.webhooks.beginAnalysis, {
    deliveryId,
    githubInstallationId: 5,
    githubAccountId: 123,
    repository: {
      githubRepoId: 42,
      owner: "acme",
      name: "app",
      fullName: "acme/app",
      private: true,
      htmlUrl: "https://github.com/acme/app",
      defaultBranch: "main",
    },
    pullRequest: {
      githubPullId: 99,
      githubPullNumber: 7,
      title: "Old account's PR",
      htmlUrl: "https://github.com/acme/app/pull/7",
      authorLogin: "author",
      baseRef: "main",
      headRef: "work",
      headSha: "abc",
    },
  });
  await t.mutation(internal.webhooks.saveRepositories, {
    installation: {
      githubInstallationId: 6,
      githubAccountId: 456,
      accountLogin: "other",
      accountType: "User",
    },
    repositories: [
      {
        githubRepoId: 42,
        owner: "acme",
        name: "app",
        fullName: "acme/app",
        private: true,
        htmlUrl: "https://github.com/acme/app",
        defaultBranch: "main",
      },
    ],
  });
  expect(
    (
      await first.query(api.dashboard.repository.get, {
        owner: "acme",
        name: "app",
      })
    ).kind,
  ).toBe("not_found");
  const transferred = await second.query(api.dashboard.repository.get, {
    owner: "acme",
    name: "app",
  });
  if (transferred.kind !== "ready")
    throw new Error("transferred repository missing");
  expect(transferred.pullRequests).toEqual([]);
  expect(
    (
      await second.query(api.dashboard.pullRequest.get, {
        owner: "acme",
        name: "app",
        pullNumber: 7,
      })
    ).kind,
  ).toBe("not_found");
  await t.mutation(internal.webhooks.removeInstallation, {
    githubInstallationId: 5,
  });
  const afterRemoval = await first.query(api.dashboard.overview.get, {});
  if (afterRemoval.kind !== "ready") throw new Error("overview missing");
  expect(afterRemoval.repositories).toEqual([]);
  expect(afterRemoval.installations).toEqual([]);
});

test("a failed delivery cannot be reclaimed", async () => {
  process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret";
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_PRIVATE_KEY = await testPrivateKey();
  delete process.env.TYPESAFE_API_KEY;
  const t = convexTest(schema, modules);
  const authed = await owner(t);
  await authed.mutation(api.rules.create, {
    slug: "risk",
    content: {
      kind: "noul",
      question: "Risk?",
      yesMeans: "Risk",
      noMeans: "No risk",
      valence: "violation",
    },
  });
  await post(t, "delivery-retry");
  await drain(t);
  const [delivery] = await t.run(async (ctx) =>
    ctx.db.query("webhookDeliveries").take(1),
  );
  expect(delivery?.status).toBe("failed");
  if (!delivery) throw new Error("delivery missing");
  expect(
    await t.mutation(internal.webhooks.claim, { deliveryId: delivery._id }),
  ).toMatchObject({ kind: "skipped", status: "failed" });
});

test("re-analyze replaces a failed attempt and writes one current result set", async () => {
  process.env.GITHUB_WEBHOOK_SECRET = "webhook-secret";
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_PRIVATE_KEY = await testPrivateKey();
  process.env.TYPESAFE_API_KEY = "test-key";
  const t = convexTest(schema, modules);
  const authed = await owner(t);
  await authed.mutation(api.rules.create, {
    slug: "risk",
    content: {
      kind: "noul",
      question: "Risk?",
      yesMeans: "Risk",
      noMeans: "No risk",
      valence: "violation",
    },
  });
  let valid = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/app/installations/5"))
      return json({
        id: 5,
        account: { id: 123, login: "owner", type: "User" },
      });
    if (url.endsWith("/access_tokens")) return json({ token: "ghs_test" });
    if (url.endsWith("/repos/acme/app")) return json(repository);
    if (url.endsWith("/pulls/7"))
      return new Headers(init?.headers).get("Accept") ===
        "application/vnd.github.diff"
        ? new Response("diff --git a/a b/a\n")
        : json(pull);
    if (url.includes("api.typesafe.ai"))
      return json({
        model: "jev-test",
        answers: valid ? { risk: { type: "noul", noul: 0.9 } } : {},
      });
    return new Response("not found", { status: 404 });
  };
  try {
    await post(t, "delivery-attempts");
    await drain(t);
    const [delivery] = await t.run(async (ctx) =>
      ctx.db.query("webhookDeliveries").take(1),
    );
    expect(delivery?.status).toBe("failed");
    if (!delivery) throw new Error("delivery missing");
    valid = true;
    const other = await otherUser(t);
    expect(
      await other.action(api.analysis.rerunPullRequest, {
        owner: "acme",
        name: "app",
        pullNumber: 7,
      }),
    ).toBe("unavailable");
    expect(
      await authed.action(api.analysis.rerunPullRequest, {
        owner: "acme",
        name: "app",
        pullNumber: 7,
      }),
    ).toBe("started");
    const runs = await t.run(async (ctx) =>
      ctx.db.query("analysisRuns").take(10),
    );
    expect(runs.map((run) => run.status)).toEqual(["completed"]);
    const evaluations = await t.run(async (ctx) =>
      ctx.db.query("ruleEvaluations").take(10),
    );
    expect(evaluations).toHaveLength(1);
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
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  let binary = "";
  for (const byte of pkcs8) binary += String.fromCharCode(byte);
  const lines = btoa(binary).match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----\n`;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

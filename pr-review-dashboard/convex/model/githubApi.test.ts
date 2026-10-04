import { expect, test } from "vitest";
import {
  assertReadOnlyGitHub,
  createInstallationAccessToken,
  fetchAppSlug,
  findPersonalInstallation,
  fetchInstallation,
  fetchPullRequestDiff,
  listInstallationRepositories,
} from "./githubApi";

test("content writes to GitHub are refused", () => {
  expect(() =>
    assertReadOnlyGitHub(
      "POST",
      "https://api.github.com/repos/acme/app/issues/1/comments",
    ),
  ).toThrow("Refusing GitHub write POST /repos/acme/app/issues/1/comments");
  expect(() =>
    assertReadOnlyGitHub(
      "POST",
      "https://api.github.com/repos/acme/app/check-runs",
    ),
  ).toThrow("Refusing GitHub write POST /repos/acme/app/check-runs");
});

test("installation access token creation is the only GitHub POST", () => {
  expect(() =>
    assertReadOnlyGitHub(
      "POST",
      "https://api.github.com/app/installations/15/access_tokens",
    ),
  ).not.toThrow();
});

test("installation ownership comes from a verified GitHub App API response", async () => {
  const fetchImpl: typeof fetch = async () =>
    jsonResponse({
      id: 15,
      account: { id: 456, login: "someone", type: "User" },
    });
  expect(await fetchInstallation(fetchImpl, "jwt", 15)).toEqual({
    ok: true,
    value: {
      githubInstallationId: 15,
      githubAccountId: 456,
      accountLogin: "someone",
      accountType: "User",
    },
  });
  expect((await fetchInstallation(fetchImpl, "jwt", 16)).ok).toBe(false);
});

test("installation link uses the authenticated GitHub App slug", async () => {
  const fetchImpl: typeof fetch = async () =>
    jsonResponse({ slug: "just-jevving" });
  expect(await fetchAppSlug(fetchImpl, "jwt")).toEqual({
    ok: true,
    value: "just-jevving",
  });
  const badFetch: typeof fetch = async () =>
    jsonResponse({ slug: "https://evil.example" });
  expect((await fetchAppSlug(badFetch, "jwt")).ok).toBe(false);
});

test("existing personal installation lookup matches the signed-in account ID", async () => {
  const fetchImpl: typeof fetch = async () =>
    jsonResponse([
      { id: 7, account: { id: 999, login: "other", type: "User" } },
      { id: 15, account: { id: 456, login: "someone", type: "User" } },
    ]);
  expect(await findPersonalInstallation(fetchImpl, "jwt", 456)).toEqual({
    ok: true,
    value: {
      githubInstallationId: 15,
      githubAccountId: 456,
      accountLogin: "someone",
      accountType: "User",
    },
  });
  expect(await findPersonalInstallation(fetchImpl, "jwt", 123)).toEqual({
    ok: true,
    value: null,
  });
});

test("repository lists and diffs parse literal GitHub payloads", async () => {
  const requests: Array<{ url: string; method: string; accept: string }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    requests.push({
      url,
      method: init?.method ?? "GET",
      accept: headers.get("Accept") ?? "",
    });
    if (url.endsWith("/access_tokens")) {
      return jsonResponse({ token: "ghs_test" });
    }
    if (url.includes("/installation/repositories")) {
      return jsonResponse({
        repositories: [
          {
            id: 42,
            name: "just-jevving",
            full_name: "nishilfaldu/just-jevving",
            private: false,
            html_url: "https://github.com/nishilfaldu/just-jevving",
            default_branch: "main",
            owner: { login: "nishilfaldu" },
          },
        ],
      });
    }
    if (url.endsWith("/pulls/7")) {
      return new Response("diff --git a/app.ts b/app.ts\n", { status: 200 });
    }
    return new Response("not found", { status: 404 });
  };

  expect(await createInstallationAccessToken(fetchImpl, "jwt", 15)).toEqual({
    ok: true,
    value: "ghs_test",
  });
  expect(await listInstallationRepositories(fetchImpl, "ghs_test")).toEqual({
    ok: true,
    value: [
      {
        githubRepoId: 42,
        owner: "nishilfaldu",
        name: "just-jevving",
        fullName: "nishilfaldu/just-jevving",
        private: false,
        htmlUrl: "https://github.com/nishilfaldu/just-jevving",
        defaultBranch: "main",
      },
    ],
  });
  expect(
    await fetchPullRequestDiff(
      fetchImpl,
      "ghs_test",
      "nishilfaldu",
      "just-jevving",
      7,
    ),
  ).toEqual({ ok: true, value: "diff --git a/app.ts b/app.ts\n" });
  expect(requests.map((request) => request.method)).toEqual([
    "POST",
    "GET",
    "GET",
  ]);
  expect(requests[2]?.accept).toBe("application/vnd.github.diff");
  expect(
    requests.every((request) =>
      request.url.startsWith("https://api.github.com"),
    ),
  ).toBe(true);
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

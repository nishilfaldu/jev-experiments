import { expect, test } from "vitest";
import { analyzesPullRequest, parseGitHubEvent } from "./githubEvents";

const repository = {
  id: 42,
  name: "just-jevving",
  full_name: "nishilfaldu/just-jevving",
  private: false,
  html_url: "https://github.com/nishilfaldu/just-jevving",
  default_branch: "main",
  owner: { login: "nishilfaldu" },
};

const pullRequest = {
  id: 99,
  number: 7,
  title: "Change the public response",
  html_url: "https://github.com/nishilfaldu/just-jevving/pull/7",
  user: { login: "octocat" },
  base: { ref: "main", sha: "abc" },
  head: { ref: "feature", sha: "def" },
};

test("opened pull requests keep the repository and pull request fields", () => {
  const parsed = parseGitHubEvent("pull_request", {
    action: "opened",
    installation: { id: 5, account: { login: "nishilfaldu", type: "User" } },
    repository,
    pull_request: pullRequest,
  });
  expect(parsed).toEqual({
    ok: true,
    event: {
      kind: "pull_request",
      action: "opened",
      installation: {
        githubInstallationId: 5,
        accountLogin: "nishilfaldu",
        accountType: "User",
      },
      repository: {
        githubRepoId: 42,
        owner: "nishilfaldu",
        name: "just-jevving",
        fullName: "nishilfaldu/just-jevving",
        private: false,
        htmlUrl: "https://github.com/nishilfaldu/just-jevving",
        defaultBranch: "main",
      },
      pullRequest: {
        githubPullId: 99,
        githubPullNumber: 7,
        title: "Change the public response",
        htmlUrl: "https://github.com/nishilfaldu/just-jevving/pull/7",
        authorLogin: "octocat",
        baseRef: "main",
        headRef: "feature",
        headSha: "def",
      },
    },
  });
  if (parsed.ok && parsed.event.kind === "pull_request") {
    expect(analyzesPullRequest(parsed.event.action)).toBe(true);
  }
});

test("a pull request installation id without an account is kept", () => {
  const parsed = parseGitHubEvent("pull_request", {
    action: "opened",
    installation: {
      id: 5,
      node_id: "MDIzOkludGVncmF0aW9uSW5zdGFsbGF0aW9uNQ==",
    },
    repository,
    pull_request: pullRequest,
  });
  expect(parsed.ok).toBe(true);
  if (parsed.ok && parsed.event.kind === "pull_request") {
    expect(parsed.event.installation).toEqual({
      githubInstallationId: 5,
      accountLogin: "",
      accountType: "",
    });
  }
});

test("synchronize is analyzed and closed is not", () => {
  expect(analyzesPullRequest("synchronize")).toBe(true);
  expect(analyzesPullRequest("closed")).toBe(false);
});

test("a pull request payload with a mismatched full name is rejected", () => {
  const parsed = parseGitHubEvent("pull_request", {
    action: "opened",
    repository: { ...repository, full_name: "other/repo" },
    pull_request: pullRequest,
  });
  expect(parsed).toEqual({
    ok: false,
    error: "pull_request event is missing repository.",
  });
});

test("push events record the repository and do not invent a pull request", () => {
  expect(
    parseGitHubEvent("push", {
      repository: { full_name: "nishilfaldu/just-jevving" },
    }),
  ).toEqual({
    ok: true,
    event: { kind: "push", repositoryFullName: "nishilfaldu/just-jevving" },
  });
});

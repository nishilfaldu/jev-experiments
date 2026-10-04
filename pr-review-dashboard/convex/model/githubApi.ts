import { isRecord, readBoolean, readGitHubId, readString } from "./record";
import {
  readPullRequest,
  readRepository,
  type PullRequestRef,
  type RepositoryRef,
} from "./githubEvents";

const GITHUB_API_ORIGIN = "https://api.github.com";
const API_VERSION = "2022-11-28";
const USER_AGENT = "just-jevving";
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

export type InstallationRepository = {
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
};

type GitHubResult<T> = { ok: true; value: T } | { ok: false; message: string };

type FetchLike = typeof fetch;

export async function fetchAppSlug(
  fetchImpl: FetchLike,
  jwt: string,
): Promise<GitHubResult<string>> {
  const response = await githubRequest(
    fetchImpl,
    "GET",
    "/app",
    jwt,
    "application/vnd.github+json",
  );
  if (!response.ok) return response;
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    return { ok: false, message: "GitHub App response was not JSON." };
  }
  if (!isRecord(payload))
    return { ok: false, message: "GitHub App response was not an object." };
  const slug = readString(payload.slug);
  if (slug === null || !/^[a-z0-9-]+$/.test(slug))
    return { ok: false, message: "GitHub App response omitted a valid slug." };
  return { ok: true, value: slug };
}

export async function findPersonalInstallation(
  fetchImpl: FetchLike,
  jwt: string,
  githubAccountId: number,
): Promise<
  GitHubResult<{
    githubInstallationId: number;
    githubAccountId: number;
    accountLogin: string;
    accountType: string;
  } | null>
> {
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await githubRequest(
      fetchImpl,
      "GET",
      `/app/installations?per_page=${PAGE_SIZE}&page=${page}`,
      jwt,
      "application/vnd.github+json",
    );
    if (!response.ok) return response;
    let payload: unknown;
    try {
      payload = JSON.parse(response.body);
    } catch {
      return { ok: false, message: "Installation list was not JSON." };
    }
    if (!Array.isArray(payload))
      return { ok: false, message: "Installation list was not an array." };
    for (const item of payload) {
      if (!isRecord(item) || !isRecord(item.account)) continue;
      if (
        readGitHubId(item.account.id) !== githubAccountId ||
        item.account.type !== "User"
      )
        continue;
      const id = readGitHubId(item.id);
      const login = readString(item.account.login);
      if (id !== null && login !== null)
        return {
          ok: true,
          value: {
            githubInstallationId: id,
            githubAccountId,
            accountLogin: login,
            accountType: "User",
          },
        };
    }
    if (payload.length < PAGE_SIZE) return { ok: true, value: null };
  }
  return { ok: true, value: null };
}

export async function fetchInstallation(
  fetchImpl: FetchLike,
  jwt: string,
  installationId: number,
): Promise<
  GitHubResult<{
    githubInstallationId: number;
    githubAccountId: number;
    accountLogin: string;
    accountType: string;
  }>
> {
  const response = await githubRequest(
    fetchImpl,
    "GET",
    `/app/installations/${installationId}`,
    jwt,
    "application/vnd.github+json",
  );
  if (!response.ok) return response;
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    return { ok: false, message: "Installation response was not JSON." };
  }
  if (!isRecord(payload) || !isRecord(payload.account))
    return { ok: false, message: "Installation response omitted account." };
  const id = readGitHubId(payload.id);
  const accountId = readGitHubId(payload.account.id);
  const login = readString(payload.account.login);
  const type = readString(payload.account.type);
  if (
    id !== installationId ||
    accountId === null ||
    login === null ||
    type === null
  )
    return {
      ok: false,
      message: "Installation response had invalid identity.",
    };
  return {
    ok: true,
    value: {
      githubInstallationId: id,
      githubAccountId: accountId,
      accountLogin: login,
      accountType: type,
    },
  };
}

export function assertReadOnlyGitHub(method: string, url: string): void {
  const parsed = new URL(url);
  if (parsed.origin !== GITHUB_API_ORIGIN) {
    throw new Error(`Refusing non-GitHub API origin ${parsed.origin}`);
  }
  if (method === "GET") {
    return;
  }
  if (
    method === "POST" &&
    /^\/app\/installations\/\d+\/access_tokens$/.test(parsed.pathname)
  ) {
    return;
  }
  throw new Error(`Refusing GitHub write ${method} ${parsed.pathname}`);
}

export async function createInstallationAccessToken(
  fetchImpl: FetchLike,
  jwt: string,
  installationId: number,
): Promise<GitHubResult<string>> {
  const response = await githubRequest(
    fetchImpl,
    "POST",
    `/app/installations/${installationId}/access_tokens`,
    jwt,
    "application/vnd.github+json",
  );
  if (!response.ok) {
    return response;
  }
  let payload: unknown;
  try {
    payload = JSON.parse(response.body);
  } catch {
    return { ok: false, message: "Installation token response was not JSON." };
  }
  if (!isRecord(payload)) {
    return {
      ok: false,
      message: "Installation token response was not an object.",
    };
  }
  const token = readString(payload.token);
  if (token === null) {
    return { ok: false, message: "Installation token response omitted token." };
  }
  return { ok: true, value: token };
}

export async function listInstallationRepositories(
  fetchImpl: FetchLike,
  token: string,
): Promise<GitHubResult<InstallationRepository[]>> {
  const repositories: InstallationRepository[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await githubRequest(
      fetchImpl,
      "GET",
      `/installation/repositories?per_page=${PAGE_SIZE}&page=${page}`,
      token,
      "application/vnd.github+json",
    );
    if (!response.ok) {
      return response;
    }
    const pageRepos = parseRepositoryPage(response.body);
    if (!pageRepos.ok) {
      return pageRepos;
    }
    repositories.push(...pageRepos.value);
    if (pageRepos.value.length < PAGE_SIZE) {
      break;
    }
  }
  return { ok: true, value: repositories };
}

export async function fetchPullRequestDiff(
  fetchImpl: FetchLike,
  token: string,
  owner: string,
  name: string,
  pullNumber: number,
): Promise<GitHubResult<string>> {
  const response = await githubRequest(
    fetchImpl,
    "GET",
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls/${pullNumber}`,
    token,
    "application/vnd.github.diff",
  );
  if (!response.ok) {
    return response;
  }
  if (response.body.startsWith("{")) {
    return {
      ok: false,
      message: "GitHub returned JSON instead of a pull request diff.",
    };
  }
  return { ok: true, value: response.body };
}

export async function fetchPullRequestMetadata(
  fetchImpl: FetchLike,
  token: string,
  owner: string,
  name: string,
  pullNumber: number,
): Promise<
  GitHubResult<{ repository: RepositoryRef; pullRequest: PullRequestRef }>
> {
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const [repoResponse, pullResponse] = await Promise.all([
    githubRequest(fetchImpl, "GET", base, token, "application/vnd.github+json"),
    githubRequest(
      fetchImpl,
      "GET",
      `${base}/pulls/${pullNumber}`,
      token,
      "application/vnd.github+json",
    ),
  ]);
  if (!repoResponse.ok) return repoResponse;
  if (!pullResponse.ok) return pullResponse;
  try {
    const repository = readRepository(JSON.parse(repoResponse.body));
    const pullRequest = readPullRequest(JSON.parse(pullResponse.body));
    if (
      repository === null ||
      pullRequest === null ||
      pullRequest.githubPullNumber !== pullNumber
    ) {
      return {
        ok: false,
        message: "GitHub returned incomplete pull request metadata.",
      };
    }
    return { ok: true, value: { repository, pullRequest } };
  } catch {
    return { ok: false, message: "GitHub pull request metadata was not JSON." };
  }
}

function parseRepositoryPage(
  body: string,
): GitHubResult<InstallationRepository[]> {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return {
      ok: false,
      message: "Installation repositories response was not JSON.",
    };
  }
  if (!isRecord(payload) || !Array.isArray(payload.repositories)) {
    return {
      ok: false,
      message: "Installation repositories response omitted repositories.",
    };
  }
  const repositories: InstallationRepository[] = [];
  for (const entry of payload.repositories) {
    const repository = readInstallationRepository(entry);
    if (repository === null) {
      return {
        ok: false,
        message:
          "Installation repositories response had an invalid repository.",
      };
    }
    repositories.push(repository);
  }
  return { ok: true, value: repositories };
}

function readInstallationRepository(
  value: unknown,
): InstallationRepository | null {
  if (!isRecord(value) || !isRecord(value.owner)) {
    return null;
  }
  const githubRepoId = readGitHubId(value.id);
  const owner = readString(value.owner.login);
  const name = readString(value.name);
  const fullName = readString(value.full_name);
  const isPrivate = readBoolean(value.private);
  const htmlUrl = readString(value.html_url);
  const defaultBranch = readString(value.default_branch);
  if (
    githubRepoId === null ||
    owner === null ||
    name === null ||
    fullName === null ||
    isPrivate === null ||
    htmlUrl === null ||
    defaultBranch === null ||
    fullName !== `${owner}/${name}`
  ) {
    return null;
  }
  return {
    githubRepoId,
    owner,
    name,
    fullName,
    private: isPrivate,
    htmlUrl,
    defaultBranch,
  };
}

type GitHubHttpResult =
  { ok: true; body: string } | { ok: false; message: string };

async function githubRequest(
  fetchImpl: FetchLike,
  method: "GET" | "POST",
  path: string,
  token: string,
  accept: string,
): Promise<GitHubHttpResult> {
  const url = `${GITHUB_API_ORIGIN}${path}`;
  assertReadOnlyGitHub(method, url);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": API_VERSION,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "network error";
    return { ok: false, message: `GitHub request failed: ${message}` };
  }
  const body = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      message: `GitHub ${method} ${path} returned ${response.status}.`,
    };
  }
  return { ok: true, body };
}

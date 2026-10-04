import { isRecord, readBoolean, readGitHubId, readString } from "./record";
import { v, type Infer } from "convex/values";

export const deliveryEventValidator = v.union(
  v.object({ kind: v.literal("ping") }),
  v.object({
    kind: v.literal("ignored"),
    action: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("push"),
    repository: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("installation"),
    installationId: v.number(),
    action: v.string(),
  }),
  v.object({
    kind: v.literal("installation_repositories"),
    installationId: v.number(),
    action: v.string(),
  }),
  v.object({
    kind: v.literal("pull_request"),
    installationId: v.union(v.number(), v.null()),
    repository: v.string(),
    pullNumber: v.number(),
    action: v.string(),
  }),
);

export type DeliveryEvent = Infer<typeof deliveryEventValidator>;

export function normalizedDeliveryEvent(
  event: ParsedGitHubEvent,
): DeliveryEvent {
  switch (event.kind) {
    case "ping":
      return { kind: "ping" };
    case "ignored":
      return { kind: "ignored", action: event.action };
    case "push":
      return { kind: "push", repository: event.repositoryFullName };
    case "installation":
    case "installation_repositories":
      return {
        kind: event.kind,
        installationId: event.installation.githubInstallationId,
        action: event.action,
      };
    case "pull_request":
      return {
        kind: "pull_request",
        installationId: event.installation?.githubInstallationId ?? null,
        repository: event.repository.fullName,
        pullNumber: event.pullRequest.githubPullNumber,
        action: event.action,
      };
  }
}

export type InstallationRef = {
  githubInstallationId: number;
  accountLogin: string;
  accountType: string;
};

export type RepositoryRef = {
  githubRepoId: number;
  owner: string;
  name: string;
  fullName: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
};

export type PullRequestRef = {
  githubPullId: number;
  githubPullNumber: number;
  title: string;
  htmlUrl: string;
  authorLogin: string;
  baseRef: string;
  headRef: string;
  headSha: string;
};

type ParsedGitHubEvent =
  | { kind: "ping" }
  | {
      kind: "installation";
      action: string;
      installation: InstallationRef;
    }
  | {
      kind: "installation_repositories";
      action: string;
      installation: InstallationRef;
    }
  | { kind: "push"; repositoryFullName: string | null }
  | {
      kind: "pull_request";
      action: string;
      installation: InstallationRef | null;
      repository: RepositoryRef;
      pullRequest: PullRequestRef;
    }
  | { kind: "ignored"; event: string; action: string | null };

type ParseGitHubEventResult =
  { ok: true; event: ParsedGitHubEvent } | { ok: false; error: string };

const ANALYZED_PULL_ACTIONS = new Set(["opened", "synchronize"]);

export function analyzesPullRequest(action: string): boolean {
  return ANALYZED_PULL_ACTIONS.has(action);
}

export function parseGitHubEvent(
  eventName: string,
  payload: unknown,
): ParseGitHubEventResult {
  if (!isRecord(payload)) {
    return { ok: false, error: "Webhook payload must be a JSON object." };
  }
  const action = readString(payload.action);

  if (eventName === "ping") {
    return { ok: true, event: { kind: "ping" } };
  }

  if (eventName === "installation") {
    if (action === null) {
      return { ok: false, error: "installation event is missing action." };
    }
    const installation = readInstallation(payload.installation);
    if (installation === null) {
      return {
        ok: false,
        error: "installation event is missing installation.",
      };
    }
    return { ok: true, event: { kind: "installation", action, installation } };
  }

  if (eventName === "installation_repositories") {
    if (action === null) {
      return {
        ok: false,
        error: "installation_repositories event is missing action.",
      };
    }
    const installation = readInstallation(payload.installation);
    if (installation === null) {
      return {
        ok: false,
        error: "installation_repositories event is missing installation.",
      };
    }
    return {
      ok: true,
      event: { kind: "installation_repositories", action, installation },
    };
  }

  if (eventName === "push") {
    const repository = isRecord(payload.repository)
      ? readString(payload.repository.full_name)
      : null;
    return {
      ok: true,
      event: { kind: "push", repositoryFullName: repository },
    };
  }

  if (eventName === "pull_request") {
    if (action === null) {
      return { ok: false, error: "pull_request event is missing action." };
    }
    const repository = readRepository(payload.repository);
    if (repository === null) {
      return { ok: false, error: "pull_request event is missing repository." };
    }
    const pullRequest = readPullRequest(payload.pull_request);
    if (pullRequest === null) {
      return {
        ok: false,
        error: "pull_request event is missing pull_request.",
      };
    }
    const installation = readPullRequestInstallation(payload.installation);
    if (payload.installation !== undefined && installation === null) {
      return {
        ok: false,
        error: "pull_request installation object is invalid.",
      };
    }
    return {
      ok: true,
      event: {
        kind: "pull_request",
        action,
        installation,
        repository,
        pullRequest,
      },
    };
  }

  return { ok: true, event: { kind: "ignored", event: eventName, action } };
}

function readPullRequestInstallation(value: unknown): InstallationRef | null {
  if (value === undefined) {
    return null;
  }
  const installation = readInstallation(value);
  if (installation !== null) {
    return installation;
  }
  if (!isRecord(value)) {
    return null;
  }
  const githubInstallationId = readGitHubId(value.id);
  if (githubInstallationId === null) {
    return null;
  }
  // pull_request deliveries include installation id and node_id only.
  return {
    githubInstallationId,
    accountLogin: "",
    accountType: "",
  };
}

function readInstallation(value: unknown): InstallationRef | null {
  if (!isRecord(value)) {
    return null;
  }
  const githubInstallationId = readGitHubId(value.id);
  if (!isRecord(value.account)) {
    return null;
  }
  const accountLogin = readString(value.account.login);
  const accountType = readString(value.account.type);
  if (
    githubInstallationId === null ||
    accountLogin === null ||
    accountType === null
  ) {
    return null;
  }
  return { githubInstallationId, accountLogin, accountType };
}

export function readRepository(value: unknown): RepositoryRef | null {
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
    defaultBranch === null
  ) {
    return null;
  }
  if (fullName !== `${owner}/${name}`) {
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

export function readPullRequest(value: unknown): PullRequestRef | null {
  if (
    !isRecord(value) ||
    !isRecord(value.user) ||
    !isRecord(value.base) ||
    !isRecord(value.head)
  ) {
    return null;
  }
  const githubPullId = readGitHubId(value.id);
  const githubPullNumber = readGitHubId(value.number);
  const title = typeof value.title === "string" ? value.title : null;
  const htmlUrl = readString(value.html_url);
  const authorLogin = readString(value.user.login);
  const baseRef = readString(value.base.ref);
  const headRef = readString(value.head.ref);
  const headSha = readString(value.head.sha);
  if (
    githubPullId === null ||
    githubPullNumber === null ||
    title === null ||
    htmlUrl === null ||
    authorLogin === null ||
    baseRef === null ||
    headRef === null ||
    headSha === null
  ) {
    return null;
  }
  return {
    githubPullId,
    githubPullNumber,
    title,
    htmlUrl,
    authorLogin,
    baseRef,
    headRef,
    headSha,
  };
}

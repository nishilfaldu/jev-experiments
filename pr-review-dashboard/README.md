# just-jevving

A dashboard that evaluates GitHub pull request diffs against questions each user writes. Each rule gets a yes/no probability from Jev. A rule marked **violation** produces a finding when yes outweighs no; an **informational** rule remains neutral regardless of its probability.

## Run locally

This project uses Next.js 16, Convex, and pnpm 11.

1. Install dependencies: `pnpm install`.
2. Configure a Convex development deployment: `pnpm exec convex dev`.
3. Configure GitHub OAuth for `@convex-dev/auth` and set the Convex environment variables below.
4. Start both services with `pnpm dev` and open `http://localhost:3000`.
5. Sign in with GitHub, add rules under **Rules**, then use **Install GitHub App** on the dashboard. Repositories appear automatically after GitHub sends the installation webhook.

| Convex variable         | Purpose                                   |
| ----------------------- | ----------------------------------------- |
| `GITHUB_APP_ID`         | GitHub App ID.                            |
| `GITHUB_PRIVATE_KEY`    | GitHub App private key in PEM format.     |
| `GITHUB_WEBHOOK_SECRET` | Secret used to verify webhook signatures. |
| `TYPESAFE_API_KEY`      | API key for Jev evaluation.               |

Set secrets with `pnpm exec convex env set NAME VALUE` on the intended development deployment. GitHub OAuth also needs the provider credentials required by Convex Auth. The operator configures the GitHub App webhook once to `https://<CONVEX_SITE_HOST>/github/webhook`; users never configure a webhook. The GitHub App needs read access to pull requests and repository metadata, and should send `pull_request` and `installation_repositories` events (GitHub sends `installation` events by default). Installation and repository-access changes trigger automatic sync. `push` and unknown events are acknowledged without analysis. The app does not write to GitHub.

Any GitHub user may sign in. The dashboard gets the install link from the authenticated GitHub App API; if a personal installation already exists, it reconnects and syncs it automatically. GitHub App installation metadata is verified through GitHub's API before it is stored. Each user sees only repositories, analyses, and rules associated with their GitHub account ID. This version supports personal-account installations; organization installations are recorded but not exposed to members because GitHub OAuth sign-in alone does not prove access to an organization's installation. Organization access needs a separate authorization design. To let other users install the app, configure the GitHub App's visibility and installation availability accordingly in GitHub.

## How an analysis works

The HTTP endpoint verifies the GitHub signature, parses the payload once, and stores only delivery identifiers and normalized event fields. A scheduled internal action claims the delivery, fetches current repository and pull request metadata plus the diff, evaluates all active user rules, and stores one analysis run and its rule probability vectors. Failed deliveries can be retried from the pull request page; each retry creates a new run. Duplicate GitHub delivery IDs are ignored.

Rules start empty and are never seeded. Up to 64 rules can be created. The examples in [rules.md](rules.md) are reference material for future tests. Editing a rule increments its version when the question, meanings, or valence change. Completed evaluations retain their original question, version, valence, and vector.

The model currently sees at most 60,000 diff characters. Completed runs record both source and analyzed byte counts and whether the input was truncated. The pull request page marks these runs **Partial analysis**. A full pull request analysis strategy remains a product decision.

Repository sync runs after installation and repository-access webhooks; the dashboard's **Sync** button is only a recovery action. Sync fetches up to five GitHub pages of 100 repositories. Dashboard list and analytics views currently show bounded recent sets. These are product limits, not complete historical reports.

## Check the project

Run `pnpm test`, `pnpm lint`, and `pnpm exec tsc --noEmit`. Convex backend changes should also be pushed to the intended development deployment with `pnpm exec convex dev --once`.

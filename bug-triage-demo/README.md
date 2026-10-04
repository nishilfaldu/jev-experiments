# Jev bug triage demo

A minimal three-column demo: incoming tickets, Jev analysis, and recommended action.

## Run

Set `TYPESAFE_API_KEY` in `.env.local`, then run:

```sh
pnpm install
pnpm dev
```

Open the local URL shown by Next.js. `pnpm lint` and `pnpm build` check the project.

Click **Analyze** on any incoming ticket. The initial tickets are predefined in `app/demo-data.ts`. Use **New ticket** to add an issue, customer, source, and context for this session. A server route calls [TypeSafe's System One API](https://docs.typesafe.ai/api) using `jev-latest` and the API key from the server environment. The route asks three Choice questions (issue type, workflow, repository), one Noul question, and two Score questions in a single request. The UI reveals those answers in order, then places the ticket in a bucket based on its returned churn and severity scores. Buckets are a transparent demo rule in `app/api/analyze/route.ts`, not an additional Jev response.

Choice percentages are the API's option probabilities. Noul shows the probability of the displayed Yes or No judgment. Scores use ten API rubric levels indexed 0–9 and are scaled to 0–10 for display. The visible sequence is an animation of a single API response, not multiple calls. Completed tickets show the selected result for every Jev question and can be clicked to reopen their full analysis, including every Choice option and probability. Results are kept in memory for this session. There is no database or persistence; refreshing restores the ticket stack. An API failure leaves the ticket available to retry.

# just-jevving: product judgment and demo brief

Research date: September 22, 2026. This is product analysis, not a code review. Competitive source notes are in `2026-09-22-ai-review-competitors.md`.

## Recommendation

Make the demo about turning a team's recurring questions into inspectable signals over code changes. Prioritize custom questions, evidence, uncertainty, and informational scanning. The strongest longer-term destination is a reusable change-classification feature inside a review queue, developer platform, release tool, or coding-agent workflow. A standalone business remains a hypothesis requiring recurring usage and willingness to pay.

## Evidence boundaries

- The supplied deployment returned HTTP 500 during this session; browser navigation also failed. This does not establish a persistent outage. Live authenticated dashboard behavior was not verified.
- Current-product observations use the user's description, local README, rule examples, and selected product-facing files. The working tree contains substantial ongoing changes. Local custom rules and valence controls exist; this does not establish deployment status.
- No customer interviews, product retention data, or labeled jev-on-diff benchmark was available. Customer segments and positioning below are hypotheses, not validated demand.
- The supplied jevtypesafeai.com pages explicitly identify themselves as unaffiliated with TypeSafe. Their API and prices must not be conflated with the official service. Official reference: [TypeSafe models](https://docs.typesafe.ai/models).

## The pain and the customer

The concrete pain is a senior engineer repeatedly having to recognize the same subtle failure mode across changes: a payment error converted to success, a tenant boundary weakened, an implicit fallback changed. The question is often easy to state but expensive to keep checking manually across repositories and contributors.

The best initial user is a staff engineer or service owner responsible for several services with recurring, costly review concerns and enough change volume to miss things. Platform/reliability teams are plausible champions; an engineering manager may own the budget. A solo developer with modest PR volume is a good demonstration user but weak evidence of a buying market.

A separate dashboard of interesting percentages is a vitamin. A short queue that repeatedly identifies actionable exceptions before a release can be a painkiller. Read-only access helps a quiet evaluation alongside existing tools, but the user still needs a reason to visit. A product that never writes to GitHub cannot claim to enforce merge policy by itself.

An industrial study of automated review found benefits alongside irrelevant feedback and longer observed closure times; this is an older, observational deployment rather than proof about today's products. It supports measuring total human attention, not output volume. [Study](https://arxiv.org/abs/2412.18531)

## What the primitive enables

Natural-language questions lower the cost of expressing contextual policies and classifying semantic changes across different implementations. They do not establish a capability monopoly. [ESLint custom rules](https://eslint.org/docs/latest/extend/custom-rules) can express sophisticated programmatic checks; [Semgrep taint analysis](https://docs.semgrep.dev/writing-rules/data-flow/taint-mode/overview) tracks data flow. Prefer deterministic checks when a property can be specified precisely and checked reliably.

Jev's interesting fit is many narrow questions against shared input, followed by ordinary software deciding what to show or do. Fast evaluation matters most for interactive rule refinement, historical replay, and frequent checks inside another workflow. A once-per-PR dashboard uses less of that advantage. [Official introduction](https://docs.typesafe.ai/introduction) and [fan-out pattern](https://docs.typesafe.ai/patterns/fan-out)

Keep four ideas separate: probability of a condition, confidence statistic, consequence/severity, and sufficiency of context. Noul returns a yes probability; the separate confidence statistic belongs to Choice and Score. A displayed score is not demonstrated code-review accuracy. [Official confidence reference](https://docs.typesafe.ai/confidence)

Model limitations make narrowly scoped questions essential. Diff-only analysis cannot establish behavior of absent middleware, unchanged callees, or deployment configuration. A source coverage check and an explicit insufficient-context outcome are stronger than interpreting every weak signal as clean. [Official limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13)

The local product already batches questions and retains versioned results. Its majority-yes finding rule and aggregate yes-rate display underuse the probabilities: frequency is not correctness, and 51% should not necessarily produce the same attention demand as 99%.

## Competitive conclusion

Do not claim that custom natural-language rules, shared rule libraries, repository scoping, or rule analytics are unclaimed. CodeRabbit offers custom pre-merge checks; Qodo explicitly sells a rule lifecycle system with scoped standards and analytics. [CodeRabbit checks](https://www.coderabbit.ai/blog/pre-merge-checks-built-in-and-custom-pr-enforced), [Qodo rules](https://www.qodo.ai/qodo-rules/), [Qodo lifecycle](https://www.qodo.ai/blog/how-qodo-builds-the-wisdom-to-govern-part-2-the-rules-lifecycle-system/)

The differentiated hypothesis is a lightweight, read-only query surface for changes: questions become named, versioned signals; users can inspect positives, negatives, uncertainty, and evidence; the same signals feed different workflows. Informational queries are particularly useful because a match need not accuse an author of a defect. Absence of an identical advertised product does not prove an empty market or a moat.

## Product extensions, in priority order

1. **Rule workbench.** Write a question, run it on positive/negative/ambiguous examples, inspect evidence, revise, compare versions on the same examples. This makes the rule trustworthy and makes an excellent demo.
2. **Informational change watchlists.** Find customer-visible behavior changes, retry-policy changes, migrations, new external services, or rollout-related changes. Attach a concrete consumer: release manager, on-call engineer, service owner. A label with no consumer is decoration.
3. **Scoped team libraries.** Give rules an owner, rationale, positive/negative examples, repository/path applicability, version, and expiry/review date. Ship a small curated pack before considering a marketplace. This is useful infrastructure, not differentiation by itself.
4. **Rule quality over time.** Collect human labels, precision at the chosen threshold, sampled misses, context coverage, and actionable findings. Compare like-for-like cohorts and frozen rule/model versions. A lower firing rate can reflect changed code mix or changed model behavior, not improvement.
5. **Semantic routing.** Use the same signals to populate specialized review queues or tell an agent when further inspection is warranted. High-confidence narrow classification can select work; it should not pretend to prove an entire PR safe.
6. **Historical change search.** Replay a new question over prior changes for incident investigation or rollout audits. Distinguish model-estimated matches from verified root causes.

## Five-minute demo

Use one coherent service, such as a payment webhook. Prepare real, small diffs with known expected classifications. Record real outputs and latency before the demo; never invent confident scores for stagecraft.

| Time      | Action                                                                                                                                                                                 | Point demonstrated                                        |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 0:00–0:30 | Show a change that catches a persistence error and returns success. Explain why the service owner cares.                                                                               | A recognizable failure, immediately.                      |
| 0:30–1:15 | Write the question: “Does this change acknowledge a payment webhook as successful after its required persistence step fails?” Define legitimate duplicate handling as a boundary case. | The team states the concern in its own language.          |
| 1:15–2:15 | Evaluate a genuine failure case, an equivalent refactor retaining error propagation, and a case whose answer depends on an absent helper.                                              | Positive, negative, and insufficient evidence all matter. |
| 2:15–3:00 | Open the relevant diff beside the result. Distinguish model output from the policy deciding whether it deserves attention.                                                             | Evidence and uncertainty are inspectable.                 |
| 3:00–3:45 | Add an informational question: “Does this change how long failed webhooks are retried?” Show it as a neutral match.                                                                    | Important changes need not be violations.                 |
| 3:45–4:30 | Replay the question on a small prepared history; compare rule wording on unchanged examples.                                                                                           | Rules become reusable measurements.                       |
| 4:30–5:00 | Show measured model time versus total processing time and describe the same result feeding a review queue or agent.                                                                    | A software primitive with several destinations.           |

This is a proposed demo, not a description of already shipped replay/evidence features. If time is limited, keep the custom rule, the contrasting examples, evidence inspection, and the informational rule. Skip team administration and broad analytics. Use clearly labeled recorded results as a backup if the service fails.

## Standalone versus embedded

For an embedded feature, preserve a portable rule definition and evaluation record: question and criteria, scope, valence, rule/model versions, diff identity, context coverage, probabilities, evidence references, timing, and human feedback. Keep presentation and action policy separate from the judgment. The dashboard can remain a reference client and workbench.

For a standalone trial, pick one buyer and one recurring workflow. A plausible entry point is a reliability owner scanning changes across services before releases. Test it with three to five teams for several weeks. Require evidence of maintained rules, unprompted repeat use, accepted actionable findings, tolerable review time, and willingness to pay alongside existing review tools. Enthusiasm during a demo is insufficient.

The reusable assets are the evaluation corpus, rule definitions, feedback, context-selection know-how, and workflow fit. A model wrapper or percentage chart alone is easy to reproduce. Becoming a valuable feature is a successful destination if those assets transfer.

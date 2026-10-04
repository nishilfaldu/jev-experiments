import { expect, test } from "vitest";
import { evaluateRulesWithJev, answersFromSystemOneResult } from "./jev";
import type { RuleDefinition } from "./rules";
import { evaluationState, MAX_DIFF_CHARACTERS } from "./state";

const rules: RuleDefinition[] = [
  {
    slug: "api_behavior_change",
    content: {
      kind: "noul",
      question: "Does the diff change an API?",
      yesMeans: "API changed",
      noMeans: "No API change",
      valence: "violation",
    },
    updatedAt: 1,
  },
  {
    slug: "summary",
    content: {
      kind: "noul",
      question: "Does the diff add a feature?",
      yesMeans: "Feature added",
      noMeans: "No feature",
      valence: "informational",
    },
    updatedAt: 1,
  },
];

test("a system one result becomes one stored vector per rule", () => {
  const answers: Record<string, { type: "noul"; noul: number }> = {};
  for (const rule of rules) {
    answers[rule.slug] = {
      type: "noul",
      noul: rule.slug === "api_behavior_change" ? 0.91 : 0.1,
    };
  }
  const parsed = answersFromSystemOneResult(
    {
      model: "jev-1.13.0",
      answers,
      usage: { input_tokens: 10, output_tokens: 2 },
    },
    rules,
  );
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    return;
  }
  expect(parsed.model).toBe("jev-1.13.0");
  expect(parsed.answers).toHaveLength(rules.length);
  expect(parsed.answers[0]).toMatchObject({
    slug: "api_behavior_change",
    question: rules[0]?.content.question,
    updatedAt: 1,
    answer: { kind: "noul", valence: "violation", vector: { yes: 0.91 } },
  });
  expect(
    parsed.answers[0]?.answer.kind === "noul"
      ? parsed.answers[0].answer.vector.no
      : null,
  ).toBeCloseTo(0.09);
});

test("a missing rule answer fails the whole evaluation", () => {
  const parsed = answersFromSystemOneResult(
    { model: "jev-1.13.0", answers: {} },
    rules,
  );
  expect(parsed).toEqual({
    ok: false,
    message:
      "Jev response contained an invalid answer for api_behavior_change.",
  });
});

test("mixed choice and score answers retain labels and rubric without findings", () => {
  const mixed: RuleDefinition[] = [
    {
      slug: "focus",
      updatedAt: 2,
      content: {
        kind: "choice",
        question: "Which area needs review?",
        options: [
          { label: "auth", description: "Authentication" },
          { label: "tests", description: "Tests" },
        ],
      },
    },
    {
      slug: "complexity",
      updatedAt: 3,
      content: {
        kind: "score",
        question: "How complex?",
        rubric: ["Small", "Medium", "Large"],
      },
    },
  ];
  const parsed = answersFromSystemOneResult(
    {
      model: "jev-1.13.0",
      answers: {
        focus: {
          type: "choice",
          choice: "tests",
          confidence: 0.8,
          probabilities: { auth: 0.2, tests: 0.8 },
        },
        complexity: {
          type: "score",
          score: 1.4,
          confidence: 0.7,
          probabilities: { 0: 0.1, 1: 0.4, 2: 0.5 },
          legend: { 0: "Small", 1: "Medium", 2: "Large" },
        },
      },
    },
    mixed,
  );
  expect(parsed).toMatchObject({
    ok: true,
    answers: [
      {
        answer: {
          kind: "choice",
          choice: "tests",
          probabilities: [
            { label: "auth", probability: 0.2 },
            { label: "tests", probability: 0.8 },
          ],
        },
      },
      {
        answer: {
          kind: "score",
          score: 1.4,
          rubric: ["Small", "Medium", "Large"],
        },
      },
    ],
  });
  expect(
    answersFromSystemOneResult(
      {
        model: "jev",
        answers: {
          focus: {
            type: "choice",
            choice: "unknown",
            confidence: 1,
            probabilities: { auth: 0, tests: 1 },
          },
          complexity: {},
        },
      },
      mixed,
    ).ok,
  ).toBe(false);
});

test("evaluateRulesWithJev sends custom rules and stores the returned vectors", async () => {
  let requestBody: unknown;
  const fetchImpl: typeof fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    const answers: Record<string, { type: "noul"; noul: number }> = {};
    for (const rule of rules) {
      answers[rule.slug] = { type: "noul", noul: 0.2 };
    }
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers,
        usage: { input_tokens: 12, output_tokens: 4 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  const state = evaluationState({
    repository: "nishilfaldu/just-jevving",
    pullNumber: 7,
    title: "Swallow the error",
    diff: "diff --git a/app.ts b/app.ts\n",
  });
  const evaluation = await evaluateRulesWithJev(
    "test-key",
    state,
    rules,
    fetchImpl,
  );
  expect(evaluation.ok).toBe(true);
  if (!evaluation.ok) {
    return;
  }
  expect(evaluation.model).toBe("jev-1.13.0");
  expect(evaluation.answers.map((item) => item.answer)).toEqual(
    rules.map((rule) => ({
      kind: "noul",
      vector: { yes: 0.2, no: 0.8 },
      valence:
        rule.content.kind === "noul" ? rule.content.valence : "informational",
    })),
  );
  expect(requestBody).toMatchObject({
    state,
    model: "jev-latest",
  });
  if (
    typeof requestBody === "object" &&
    requestBody !== null &&
    "questions" in requestBody &&
    typeof requestBody.questions === "object" &&
    requestBody.questions !== null
  ) {
    expect(Object.keys(requestBody.questions).sort()).toEqual(
      rules.map((rule) => rule.slug).sort(),
    );
  }
});

test("diffs longer than the cap are cut and labeled in state", () => {
  const state = evaluationState({
    repository: "acme/app",
    pullNumber: 1,
    title: "big",
    diff: "a".repeat(MAX_DIFF_CHARACTERS + 25),
  });
  expect(state.diff).toHaveLength(MAX_DIFF_CHARACTERS);
  expect(state.diff_note).toBe(
    "The diff text was cut off at the end to fit the evaluation.",
  );
});

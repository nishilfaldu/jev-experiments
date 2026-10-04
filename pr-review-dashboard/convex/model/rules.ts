import { v, type Infer } from "convex/values";
import { probabilityVectorValidator } from "./probability";

export const ruleValenceValidator = v.union(
  v.literal("violation"),
  v.literal("informational"),
);
export type RuleValence = Infer<typeof ruleValenceValidator>;

export const ruleContentValidator = v.union(
  v.object({
    kind: v.literal("noul"),
    question: v.string(),
    yesMeans: v.string(),
    noMeans: v.string(),
    valence: ruleValenceValidator,
  }),
  v.object({
    kind: v.literal("choice"),
    question: v.string(),
    options: v.array(v.object({ label: v.string(), description: v.string() })),
  }),
  v.object({
    kind: v.literal("score"),
    question: v.string(),
    rubric: v.array(v.string()),
  }),
);
export type RuleContent = Infer<typeof ruleContentValidator>;
export type RuleDefinition = {
  slug: string;
  content: RuleContent;
  updatedAt: number;
};

export const ruleAnswerValidator = v.union(
  v.object({
    kind: v.literal("noul"),
    vector: probabilityVectorValidator,
    valence: ruleValenceValidator,
  }),
  v.object({
    kind: v.literal("choice"),
    choice: v.string(),
    confidence: v.number(),
    probabilities: v.array(
      v.object({ label: v.string(), probability: v.number() }),
    ),
  }),
  v.object({
    kind: v.literal("score"),
    score: v.number(),
    confidence: v.number(),
    probabilities: v.array(v.number()),
    rubric: v.array(v.string()),
  }),
);
export type RuleAnswer = Infer<typeof ruleAnswerValidator>;

export function isFinding(answer: RuleAnswer): boolean {
  return (
    answer.kind === "noul" &&
    answer.valence === "violation" &&
    answer.vector.yes > answer.vector.no
  );
}

export function cleanRuleContent(content: RuleContent): RuleContent {
  const question = clean(content.question, "Question");
  if (content.kind === "noul")
    return {
      ...content,
      question,
      yesMeans: clean(content.yesMeans, "Yes meaning"),
      noMeans: clean(content.noMeans, "No meaning"),
    };
  if (content.kind === "choice") {
    if (content.options.length < 2 || content.options.length > 8)
      throw new Error("Choice needs 2–8 options.");
    const options = content.options.map((option) => ({
      label: clean(option.label, "Option label"),
      description: clean(option.description, "Option description"),
    }));
    if (new Set(options.map((option) => option.label)).size !== options.length)
      throw new Error("Choice labels must be unique.");
    return { kind: "choice", question, options };
  }
  if (content.rubric.length < 2 || content.rubric.length > 10)
    throw new Error("Score needs 2–10 rubric levels.");
  return {
    kind: "score",
    question,
    rubric: content.rubric.map((level) => clean(level, "Rubric level")),
  };
}

function clean(input: string, field: string): string {
  const value = input.trim();
  if (value.length === 0 || value.length > 1000)
    throw new Error(`${field} must be 1–1000 characters.`);
  return value;
}

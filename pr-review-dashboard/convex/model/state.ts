export const MAX_DIFF_CHARACTERS = 60_000;

const DIFF_TRUNCATION_NOTE =
  "The diff text was cut off at the end to fit the evaluation.";

export type EvaluationState = {
  repository: string;
  pull_request: number;
  title: string;
  diff: string;
  diff_note?: string;
};

export function evaluationState(input: {
  repository: string;
  pullNumber: number;
  title: string;
  diff: string;
}): EvaluationState {
  if (input.diff.length <= MAX_DIFF_CHARACTERS) {
    return {
      repository: input.repository,
      pull_request: input.pullNumber,
      title: input.title,
      diff: input.diff,
    };
  }
  return {
    repository: input.repository,
    pull_request: input.pullNumber,
    title: input.title,
    diff: input.diff.slice(0, MAX_DIFF_CHARACTERS),
    diff_note: DIFF_TRUNCATION_NOTE,
  };
}

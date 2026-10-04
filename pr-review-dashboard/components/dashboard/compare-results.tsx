import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { RuleAnswer } from "@/convex/model/rules";
import { ConfidenceDistribution } from "@/components/dashboard/confidence-distribution";
import { RuleOutcomeBadge } from "@/components/dashboard/rule-outcome-badge";
import { formatPercent } from "@/lib/percent";

type CompareResult = FunctionReturnType<typeof api.compare.run>;
type QuestionResult = CompareResult["groups"][number]["results"][number];

export function CompareResults({ result }: { result: CompareResult }) {
  return (
    <section className="grid gap-3 border-t pt-5" aria-label="Compare results">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Results</h3>
        <p className="font-mono text-xs text-muted-foreground">
          {result.model} · {result.headSha.slice(0, 7)}
        </p>
      </div>
      {result.inputTruncated ? (
        <p className="rounded-md border p-3 text-xs text-muted-foreground">
          Partial analysis: {result.analyzedDiffBytes.toLocaleString()} of{" "}
          {result.sourceDiffBytes.toLocaleString()} diff bytes were analyzed.
        </p>
      ) : null}
      <div className="overflow-x-auto pb-2">
        <div className="flex w-max min-w-full gap-3">
          {result.groups.map((group) => (
            <article
              key={group.key}
              className="flex w-80 shrink-0 flex-col rounded-lg border bg-card sm:w-88"
            >
              <header className="border-b px-4 py-3">
                <h4 className="font-medium">{group.label}</h4>
                <p className="text-xs text-muted-foreground">
                  {group.results.length}{" "}
                  {group.results.length === 1 ? "question" : "questions"}
                </p>
              </header>
              <div className="divide-y">
                {group.results.map((item) => (
                  <QuestionRow key={item.key} item={item} />
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function QuestionRow({ item }: { item: QuestionResult }) {
  const answer = item.answer;
  const finding =
    answer.kind === "noul" &&
    answer.valence === "violation" &&
    answer.vector.yes > answer.vector.no;
  return (
    <div className="grid gap-3 px-4 py-4">
      <div className="grid gap-1">
        <code className="truncate text-xs text-muted-foreground">
          {item.label}
        </code>
        <p className="text-sm font-medium leading-5">{item.question}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Verdict</span>
        {answer.kind === "noul" ? (
          <RuleOutcomeBadge
            finding={finding}
            valence={answer.valence}
            yes={answer.vector.yes > answer.vector.no}
          />
        ) : answer.kind === "choice" ? (
          <strong className="text-sm">{answer.choice}</strong>
        ) : (
          <strong className="font-mono text-sm tabular-nums">
            {answer.score.toFixed(2)} / {answer.rubric.length - 1}
          </strong>
        )}
      </div>
      {answer.kind === "noul" ? (
        <ConfidenceDistribution
          vector={answer.vector}
          confidence={item.confidence}
          valence={answer.valence}
        />
      ) : (
        <NeutralDistribution answer={answer} confidence={item.confidence} />
      )}
    </div>
  );
}

function NeutralDistribution({
  answer,
  confidence,
}: {
  answer: Extract<RuleAnswer, { kind: "choice" | "score" }>;
  confidence: number;
}) {
  const items =
    answer.kind === "choice"
      ? answer.probabilities.map((item) => ({
          label: item.label,
          probability: item.probability,
        }))
      : answer.probabilities.map((probability, index) => ({
          label: String(index),
          probability,
        }));
  const tones = [
    "bg-foreground/85",
    "bg-foreground/65",
    "bg-foreground/45",
    "bg-foreground/30",
    "bg-foreground/20",
    "bg-foreground/15",
    "bg-foreground/10",
    "bg-foreground/5",
  ];
  return (
    <div className="grid gap-2">
      <div
        role="img"
        aria-label={items
          .map((item) => `${item.label} ${formatPercent(item.probability)}`)
          .join(", ")}
        className="flex h-2 overflow-hidden rounded-full bg-muted"
      >
        {items.map((item, index) => (
          <span
            key={item.label}
            className={tones[index % tones.length]}
            style={{ width: `${item.probability * 100}%` }}
          />
        ))}
      </div>
      <div className="grid gap-1 text-xs text-muted-foreground">
        {items.map((item) => (
          <span key={item.label} className="flex justify-between gap-2">
            <span className="truncate">
              {item.label}
              {answer.kind === "score"
                ? ` · ${answer.rubric[Number(item.label)]}`
                : ""}
            </span>
            <span className="shrink-0 font-mono tabular-nums">
              {formatPercent(item.probability)}
            </span>
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Confidence{" "}
        <span className="font-mono tabular-nums">
          {formatPercent(confidence)}
        </span>
      </p>
    </div>
  );
}

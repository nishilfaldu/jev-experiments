"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RuleContent } from "@/convex/model/rules";
import { Button } from "@/components/ui/button";
import { RuleContentFields } from "@/components/dashboard/rule-content-fields";
import { CompareResults } from "@/components/dashboard/compare-results";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

type Category = RuleContent["kind"];
type Entry =
  | {
      kind: "rule";
      key: string;
      ruleId: Id<"rules">;
      category: Category;
      label: string;
      question: string;
    }
  | {
      kind: "adhoc";
      key: string;
      content: RuleContent;
      category: Category;
      label: string;
      question: string;
    };
type Group = { key: string; label: string; entries: Entry[] };
type CompareResult = FunctionReturnType<typeof api.compare.run>;

const initialGroups = (): Group[] => [
  { key: "first-group", label: "Group 1", entries: [] },
];
function emptyContent(category: Category): RuleContent {
  if (category === "choice")
    return {
      kind: "choice",
      question: "",
      options: [
        { label: "", description: "" },
        { label: "", description: "" },
      ],
    };
  if (category === "score")
    return { kind: "score", question: "", rubric: ["", ""] };
  return {
    kind: "noul",
    question: "",
    yesMeans: "",
    noMeans: "",
    valence: "violation",
  };
}

export function CompareDialog({
  owner,
  name,
  pullNumber,
}: {
  owner: string;
  name: string;
  pullNumber: number;
}) {
  const rules = useQuery(api.rules.list, {});
  const compare = useAction(api.compare.run);
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [firstCategory, setFirstCategory] = useState<Category>("noul");
  const [draft, setDraft] = useState<{
    groupKey: string;
    content: RuleContent;
  } | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const category =
    groups.flatMap((group) => group.entries)[0]?.category ?? null;
  const totalQuestions = groups.reduce(
    (sum, group) => sum + group.entries.length,
    0,
  );
  const canRun = groups.every(
    (group) => group.label.trim().length > 0 && group.entries.length > 0,
  );

  function resetResult() {
    generation.current += 1;
    setResult(null);
    setError(null);
  }
  function updateGroups(next: Group[]) {
    resetResult();
    setGroups(next);
  }
  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      resetResult();
      setGroups(initialGroups());
      setDraft(null);
      setBusy(false);
      setFirstCategory("noul");
    }
  }
  function addSaved(groupKey: string, rule: NonNullable<typeof rules>[number]) {
    if (busy || (category !== null && category !== rule.content.kind)) return;
    setDraft(null);
    updateGroups(
      groups.map((group) =>
        group.key !== groupKey
          ? group
          : {
              ...group,
              entries: [
                ...group.entries,
                {
                  kind: "rule",
                  key: crypto.randomUUID(),
                  ruleId: rule._id,
                  category: rule.content.kind,
                  label: rule.slug,
                  question: rule.content.question,
                },
              ],
            },
      ),
    );
  }
  function addAdhoc(groupKey: string, content: RuleContent) {
    if (category !== null && category !== content.kind) return;
    updateGroups(
      groups.map((group) =>
        group.key !== groupKey
          ? group
          : {
              ...group,
              entries: [
                ...group.entries,
                {
                  kind: "adhoc",
                  key: crypto.randomUUID(),
                  content,
                  category: content.kind,
                  label: content.question.trim(),
                  question: content.question.trim(),
                },
              ],
            },
      ),
    );
    setDraft(null);
  }
  async function runCompare() {
    if (!canRun || draft !== null || busy) return;
    const request = ++generation.current;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await compare({
        owner,
        name,
        pullNumber,
        groups: groups.map((group) => ({
          key: group.key,
          label: group.label,
          entries: group.entries.map((entry) =>
            entry.kind === "rule"
              ? { kind: "rule" as const, key: entry.key, ruleId: entry.ruleId }
              : {
                  kind: "adhoc" as const,
                  key: entry.key,
                  content: entry.content,
                },
          ),
        })),
      });
      if (generation.current === request) setResult(response);
    } catch (cause) {
      if (generation.current === request)
        setError(cause instanceof Error ? cause.message : "Compare failed.");
    } finally {
      if (generation.current === request) setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Compare
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[min(90vh,900px)] w-[min(96vw,1100px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
        aria-describedby="compare-description"
      >
        <DialogHeader className="border-b px-5 py-4 pr-14">
          <DialogTitle>Compare groups</DialogTitle>
          <DialogDescription id="compare-description">
            Compare a broad question with a split of smaller questions against
            this PR’s latest diff. Results are not saved.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {category === null
                  ? "The first question sets the Jev category"
                  : `Category: ${category === "noul" ? "Yes / no" : category === "choice" ? "Choice" : "Score"}`}
              </p>
              <p className="text-xs text-muted-foreground">
                Groups organize questions; each answer stands on its own.
              </p>
            </div>
            <section className="grid gap-3" aria-label="Compare groups">
              {groups.map((group) => {
                const available = (rules ?? []).filter(
                  (rule) =>
                    (category === null || rule.content.kind === category) &&
                    !group.entries.some(
                      (entry) =>
                        entry.kind === "rule" && entry.ruleId === rule._id,
                    ),
                );
                return (
                  <div
                    key={group.key}
                    className="grid gap-3 rounded-lg border bg-card p-4"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label="Group name"
                        maxLength={100}
                        required
                        disabled={busy}
                        value={group.label}
                        onChange={(event) =>
                          updateGroups(
                            groups.map((item) =>
                              item.key === group.key
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className="font-medium"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy || groups.length === 1}
                        onClick={() => {
                          updateGroups(
                            groups.filter((item) => item.key !== group.key),
                          );
                          if (draft?.groupKey === group.key) setDraft(null);
                        }}
                      >
                        Remove group
                      </Button>
                    </div>
                    {group.entries.length ? (
                      <ol className="grid gap-1">
                        {group.entries.map((entry) => (
                          <li
                            key={entry.key}
                            className="flex items-start justify-between gap-3 rounded-md bg-muted/40 px-3 py-2"
                          >
                            <div className="grid min-w-0 gap-0.5">
                              <span className="truncate font-mono text-xs text-muted-foreground">
                                {entry.label}
                              </span>
                              <span className="text-sm">{entry.question}</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              aria-label={`Remove ${entry.label} from ${group.label}`}
                              onClick={() =>
                                updateGroups(
                                  groups.map((item) =>
                                    item.key === group.key
                                      ? {
                                          ...item,
                                          entries: item.entries.filter(
                                            (candidate) =>
                                              candidate.key !== entry.key,
                                          ),
                                        }
                                      : item,
                                  ),
                                )
                              }
                            >
                              Remove
                            </Button>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                        Add a saved rule or a temporary question.
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <NativeSelect
                        aria-label={`Add saved rule to ${group.label}`}
                        value=""
                        disabled={busy || available.length === 0}
                        onChange={(event) => {
                          const rule = available.find(
                            (item) => item._id === event.target.value,
                          );
                          if (rule) addSaved(group.key, rule);
                        }}
                      >
                        <NativeSelectOption value="">
                          {available.length
                            ? "Add saved rule…"
                            : "No compatible rules"}
                        </NativeSelectOption>
                        {available.map((rule) => (
                          <NativeSelectOption key={rule._id} value={rule._id}>
                            {rule.slug}
                            {rule.active ? "" : " (paused)"} ·{" "}
                            {rule.content.kind === "noul"
                              ? "yes / no"
                              : rule.content.kind}
                          </NativeSelectOption>
                        ))}
                      </NativeSelect>
                      {category === null && draft?.groupKey !== group.key ? (
                        <NativeSelect
                          aria-label="Temporary question category"
                          value={firstCategory}
                          onChange={(event) =>
                            setFirstCategory(event.target.value as Category)
                          }
                        >
                          <NativeSelectOption value="noul">
                            Yes / no
                          </NativeSelectOption>
                          <NativeSelectOption value="choice">
                            Choice
                          </NativeSelectOption>
                          <NativeSelectOption value="score">
                            Score
                          </NativeSelectOption>
                        </NativeSelect>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || draft !== null}
                        onClick={() =>
                          setDraft({
                            groupKey: group.key,
                            content: emptyContent(category ?? firstCategory),
                          })
                        }
                      >
                        Add temporary question
                      </Button>
                    </div>
                    {draft?.groupKey === group.key ? (
                      <AdhocForm
                        content={draft.content}
                        onChange={(content) =>
                          setDraft({ groupKey: group.key, content })
                        }
                        onAdd={(content) => addAdhoc(group.key, content)}
                        onCancel={() => setDraft(null)}
                      />
                    ) : null}
                  </div>
                );
              })}
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || draft !== null}
                  onClick={() =>
                    updateGroups([
                      ...groups,
                      {
                        key: crypto.randomUUID(),
                        label: `Group ${groups.length + 1}`,
                        entries: [],
                      },
                    ])
                  }
                >
                  Add group
                </Button>
              </div>
            </section>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                disabled={busy || !canRun || draft !== null}
                onClick={() => void runCompare()}
              >
                {busy
                  ? "Comparing…"
                  : `Compare ${groups.length} ${groups.length === 1 ? "group" : "groups"}`}
              </Button>
              <p className="text-xs text-muted-foreground">
                {totalQuestions}{" "}
                {totalQuestions === 1 ? "question" : "questions"}
                {draft !== null
                  ? " · add or discard the unfinished question"
                  : ""}
              </p>
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
            {result ? <CompareResults result={result} /> : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdhocForm({
  content,
  onChange,
  onAdd,
  onCancel,
}: {
  content: RuleContent;
  onChange: (content: RuleContent) => void;
  onAdd: (content: RuleContent) => void;
  onCancel: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAdd(content);
  }
  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-lg border bg-muted/20 p-3"
    >
      <p className="text-xs font-medium">
        Temporary {content.kind === "noul" ? "yes / no" : content.kind} question
      </p>
      <RuleContentFields content={content} onChange={onChange} />
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          Add to group
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          Discard
        </Button>
      </div>
    </form>
  );
}

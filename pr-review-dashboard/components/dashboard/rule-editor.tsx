"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RuleContentFields } from "@/components/dashboard/rule-content-fields";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { RuleContent } from "@/convex/model/rules";
import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";

type Draft = { slug: string; content: RuleContent; active: boolean };
const blank = (): Draft => ({
  slug: "",
  content: {
    kind: "noul",
    question: "",
    yesMeans: "",
    noMeans: "",
    valence: "violation",
  },
  active: true,
});
const emptyContent = (kind: RuleContent["kind"]): RuleContent =>
  kind === "noul"
    ? { kind, question: "", yesMeans: "", noMeans: "", valence: "violation" }
    : kind === "choice"
      ? {
          kind,
          question: "",
          options: [
            { label: "", description: "" },
            { label: "", description: "" },
          ],
        }
      : { kind, question: "", rubric: ["", ""] };

export function RuleEditor() {
  const rules = useQuery(api.rules.list, {});
  const create = useMutation(api.rules.create);
  const update = useMutation(api.rules.update);
  const [editing, setEditing] = useState<Id<"rules"> | null>(null);
  const editHistory = useQuery(
    api.rules.editHistory,
    editing === null ? "skip" : { id: editing },
  );
  const [draft, setDraft] = useState<Draft>(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const content = draft.content;
  const setContent = (next: RuleContent) =>
    setDraft({ ...draft, content: next });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editing === null) await create({ slug: draft.slug, content });
      else await update({ id: editing, content, active: draft.active });
      setEditing(null);
      setDraft(blank());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save rule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid gap-5" aria-labelledby="rules-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-5">
        <div>
          <h1
            id="rules-heading"
            className="text-3xl font-semibold tracking-tight"
          >
            Rules
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ask yes/no, choice, or score questions about each pull request diff.
            New installations start with no rules.
          </p>
        </div>
        {editing !== null ? (
          <Button
            variant="outline"
            onClick={() => {
              setEditing(null);
              setDraft(blank());
            }}
          >
            New rule
          </Button>
        ) : null}
      </div>
      {rules?.length ? (
        <ul className="divide-y rounded-xl border">
          {rules.map((rule) => (
            <li
              key={rule._id}
              className="flex flex-wrap items-start justify-between gap-3 p-4"
            >
              <div className="grid gap-1">
                <span className="font-mono text-sm font-medium">
                  {rule.slug}
                </span>
                <span className="text-sm">{rule.content.question}</span>
                <span className="text-xs text-muted-foreground">
                  {rule.content.kind === "noul"
                    ? rule.content.valence === "violation"
                      ? "Yes means violation"
                      : "Informational"
                    : rule.content.kind === "choice"
                      ? "Choice · neutral"
                      : "Score · neutral"}{" "}
                  · {rule.active ? "Active" : "Paused"}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(rule._id);
                  setDraft({
                    slug: rule.slug,
                    content: rule.content,
                    active: rule.active,
                  });
                  setError(null);
                }}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border p-5 text-sm text-muted-foreground">
          No rules yet. Add a question below to begin analyzing pull requests.
        </p>
      )}

      <form
        onSubmit={(event) => {
          void save(event);
        }}
        className="grid gap-4 rounded-xl border bg-card p-5"
      >
        <h2 className="text-lg font-semibold">
          {editing === null ? "Add a rule" : `Edit ${draft.slug}`}
        </h2>
        <label className="grid gap-1.5 text-sm font-medium">
          Slug
          <Input
            required
            disabled={editing !== null}
            value={draft.slug}
            onChange={(event) =>
              setDraft({ ...draft, slug: event.target.value })
            }
            placeholder="e.g. review_focus"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Answer type
          <NativeSelect
            value={content.kind}
            onChange={(event) =>
              setContent(
                emptyContent(event.target.value as RuleContent["kind"]),
              )
            }
          >
            <NativeSelectOption value="noul">Yes / no</NativeSelectOption>
            <NativeSelectOption value="choice">Choice</NativeSelectOption>
            <NativeSelectOption value="score">Score</NativeSelectOption>
          </NativeSelect>
        </label>
        <RuleContentFields content={content} onChange={setContent} />
        {editing !== null ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={draft.active}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, active: checked })
              }
            />
            Active
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving" : editing === null ? "Add rule" : "Save rule"}
          </Button>
        </div>
      </form>
      {editing !== null && editHistory && editHistory.length > 0 ? (
        <section
          className="grid gap-3 rounded-xl border p-5"
          aria-label="Rule edit history"
        >
          <h2 className="text-lg font-semibold">Edit history</h2>
          <p className="text-sm text-muted-foreground">
            Previous rule definitions are kept here; previous results are not.
          </p>
          <ul className="divide-y">
            {editHistory.map((edit) => (
              <li key={edit._id} className="grid gap-1 py-3 text-sm">
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={new Date(edit.editedAt).toISOString()}
                >
                  {new Date(edit.editedAt).toLocaleString()}
                </time>
                <p>
                  Before ({edit.before.kind}): {edit.before.question}
                </p>
                <p>
                  After ({edit.after.kind}): {edit.after.question}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}

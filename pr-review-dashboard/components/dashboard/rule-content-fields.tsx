"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { RuleContent, RuleValence } from "@/convex/model/rules";

export function RuleContentFields({
  content,
  onChange,
}: {
  content: RuleContent;
  onChange: (content: RuleContent) => void;
}) {
  return (
    <>
      <label className="grid gap-1.5 text-sm font-medium">
        Question
        <Textarea
          required
          value={content.question}
          onChange={(event) =>
            onChange({ ...content, question: event.target.value })
          }
          placeholder="What should Jev look for in this diff?"
        />
      </label>
      {content.kind === "noul" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">
              What yes means
              <Textarea
                required
                value={content.yesMeans}
                onChange={(event) =>
                  onChange({ ...content, yesMeans: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">
              What no means
              <Textarea
                required
                value={content.noMeans}
                onChange={(event) =>
                  onChange({ ...content, noMeans: event.target.value })
                }
              />
            </label>
          </div>
          <label className="grid gap-1.5 text-sm font-medium">
            Valence
            <NativeSelect
              value={content.valence}
              onChange={(event) =>
                onChange({
                  ...content,
                  valence: event.target.value as RuleValence,
                })
              }
            >
              <NativeSelectOption value="violation">
                Yes means violation
              </NativeSelectOption>
              <NativeSelectOption value="informational">
                Informational (neutral)
              </NativeSelectOption>
            </NativeSelect>
          </label>
        </>
      ) : content.kind === "choice" ? (
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">
            Options (2–8, one selected)
          </legend>
          {content.options.map((option, index) => (
            <div
              key={index}
              className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(7rem,1fr)_minmax(10rem,2fr)_auto]"
            >
              <Input
                required
                aria-label={`Option ${index + 1} label`}
                placeholder="Label"
                value={option.label}
                onChange={(event) =>
                  onChange({
                    ...content,
                    options: content.options.map((item, i) =>
                      i === index
                        ? { ...item, label: event.target.value }
                        : item,
                    ),
                  })
                }
              />
              <Input
                required
                aria-label={`Option ${index + 1} description`}
                placeholder="When to select this option"
                value={option.description}
                onChange={(event) =>
                  onChange({
                    ...content,
                    options: content.options.map((item, i) =>
                      i === index
                        ? { ...item, description: event.target.value }
                        : item,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={content.options.length <= 2}
                onClick={() =>
                  onChange({
                    ...content,
                    options: content.options.filter((_, i) => i !== index),
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={content.options.length >= 8}
              onClick={() =>
                onChange({
                  ...content,
                  options: [...content.options, { label: "", description: "" }],
                })
              }
            >
              Add option
            </Button>
          </div>
        </fieldset>
      ) : (
        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium">
            Rubric (2–10 levels, scored from 0)
          </legend>
          {content.rubric.map((level, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-5 font-mono text-sm text-muted-foreground">
                {index}
              </span>
              <Input
                required
                aria-label={`Score ${index} description`}
                placeholder={`What score ${index} means`}
                value={level}
                onChange={(event) =>
                  onChange({
                    ...content,
                    rubric: content.rubric.map((item, i) =>
                      i === index ? event.target.value : item,
                    ),
                  })
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={content.rubric.length <= 2}
                onClick={() =>
                  onChange({
                    ...content,
                    rubric: content.rubric.filter((_, i) => i !== index),
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={content.rubric.length >= 10}
              onClick={() =>
                onChange({ ...content, rubric: [...content.rubric, ""] })
              }
            >
              Add level
            </Button>
          </div>
        </fieldset>
      )}
      {content.kind !== "noul" ? (
        <p className="text-xs text-muted-foreground">
          Choice and score results are informational and never create findings.
        </p>
      ) : null}
    </>
  );
}

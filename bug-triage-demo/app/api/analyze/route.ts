import { buckets, issueTypes, repositories, tickets, workflows, type ChoiceResult, type Ticket } from "../../demo-data";

type Answer = { type: string; choice?: string; probabilities?: Record<string, number>; confidence?: number; noul?: number; score?: number };
const levels = [
  "0 — negligible impact", "1 — very low impact", "2 — low impact", "3 — limited impact", "4 — mild impact",
  "5 — moderate impact", "6 — meaningful impact", "7 — high impact", "8 — very high impact", "9 — critical impact",
];
function validChoice(answer: Answer | undefined, options: Record<string, string>): answer is Answer & ChoiceResult {
  return !!answer && answer.type === "choice" && typeof answer.choice === "string" && answer.choice in options &&
    typeof answer.confidence === "number" && !!answer.probabilities &&
    Object.keys(options).every((key) => typeof answer.probabilities?.[key] === "number");
}
function validScore(answer: Answer | undefined): answer is Answer & { score: number } {
  return !!answer && answer.type === "score" && typeof answer.score === "number" && Number.isFinite(answer.score) && answer.score >= 0 && answer.score <= 9;
}
export async function POST(request: Request) {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key) return Response.json({ error: "Jev API key is not configured." }, { status: 503 });
  let input: { id?: unknown; ticket?: unknown };
  try { input = await request.json(); } catch { return Response.json({ error: "Invalid request." }, { status: 400 }); }
  const id = input.id;
  const custom = input.ticket;
  const validText = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
  let ticket: Ticket | undefined = typeof id === "string" ? tickets.find((item) => item.id === id) : undefined;
  if (!ticket && typeof id === "string" && id.startsWith("CUSTOM-") && custom && typeof custom === "object") {
    const candidate = custom as Partial<Ticket>;
    if (candidate.id === id && validText(candidate.title, 120) && validText(candidate.customer, 80) && validText(candidate.source, 40) && validText(candidate.context, 600)) {
      ticket = candidate as Ticket;
    }
  }
  if (!ticket) return Response.json({ error: "Unknown ticket." }, { status: 400 });
  try {
    const response = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "jev-latest",
        state: { issue: ticket.title, source: ticket.source, customer: ticket.customer, context: ticket.context },
        questions: {
          issueType: { type: "choice", instructions: "What is the primary type of issue in this ticket? Select the most specific category that best describes the defect itself, rather than its business impact.", criteria: issueTypes },
          workflow: { type: "choice", instructions: "Which product workflow is most directly affected by this issue?", criteria: workflows },
          repository: { type: "choice", instructions: "Which code repository is the most likely place to investigate this issue? Choose based on where the faulty behavior would probably be implemented.", criteria: repositories },
          core: { type: "noul", instructions: "Does this issue affect a core workflow that members or staff rely on to use the product?" },
          churn: { type: "score", instructions: "How much customer churn risk does this issue create? Consider the customer impact, importance of the workflow, and likelihood that users or the customer will leave. Rate risk, not technical severity.", criteria: levels.map((level) => level.replace("impact", "churn risk")) },
          severity: { type: "score", instructions: "How severe is the technical and functional defect itself, regardless of customer churn risk?", criteria: levels },
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return Response.json({ error: response.status === 429 || response.status === 529 ? "Jev is busy. Please try again." : "Jev could not analyze this ticket. Please try again." }, { status: 502 });
    const data = await response.json() as { model?: string; answers?: Record<string, Answer> };
    const a = data.answers;
    if (!a || !validChoice(a.issueType, issueTypes) || !validChoice(a.workflow, workflows) || !validChoice(a.repository, repositories) || a.core?.type !== "noul" || typeof a.core.noul !== "number" || !validScore(a.churn) || !validScore(a.severity)) {
      return Response.json({ error: "Jev returned an incomplete result. Please try again." }, { status: 502 });
    }
    // Scores have ten levels indexed 0–9. Display them on a 0–10 scale.
    const churn = Math.round(a.churn.score / 9 * 100) / 10;
    const severity = Math.round(a.severity.score / 9 * 100) / 10;
    const bucket = churn >= 8 || severity >= 8.5 ? buckets[0] : churn >= 4.5 || severity >= 5 ? buckets[1] : buckets[2];
    return Response.json({ issueType: a.issueType, workflow: a.workflow, repository: a.repository, core: a.core.noul, churn, severity, bucket, model: data.model ?? "Jev" });
  } catch {
    return Response.json({ error: "Jev is unavailable. Please try again." }, { status: 502 });
  }
}

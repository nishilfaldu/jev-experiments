"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { buckets, tickets, type Evaluation, type Ticket, type ChoiceResult } from "./demo-data";

type IconName = "source" | "customer" | "workflow" | "repository" | "core" | "churn" | "severity" | "fix" | "sprint" | "backlog" | "arrow";
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    source: <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 9h10M7 13h7M8 18l-2 3"/></>,
    customer: <><path d="M3 21V8l9-5 9 5v13M3 21h18M9 21v-6h6v6M8 10h1m6 0h1"/></>,
    workflow: <><path d="M4 5h8l8 7-8 8-8-8V5Z"/><circle cx="8" cy="9" r="1"/></>,
    repository: <><circle cx="6" cy="4" r="2"/><circle cx="6" cy="20" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 6v12M18 10a7 7 0 0 1-7 7H6"/></>,
    core: <><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h9"/></>,
    churn: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 8a3 3 0 0 1 0 6m2 6v-2a5 5 0 0 0-2-4"/></>,
    severity: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.2"/></>,
    fix: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3v.2"/></>,
    sprint: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
    backlog: <><rect x="3" y="5" width="18" height="4" rx="1"/><path d="M5 9v11h14V9M10 14h4"/></>,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  };
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
function TicketCard({ ticket, onAnalyze, disabled, compact = false }: { ticket: Ticket; onAnalyze?: () => void; disabled?: boolean; compact?: boolean }) {
  return <article className={`ticket-card ${compact ? "compact" : ""}`}>
    <div className="ticket-meta"><span><Icon name="source" />{ticket.source}</span><span>#{ticket.id}</span></div>
    <h3>{ticket.title}</h3>
    <div className="ticket-bottom"><span><Icon name="customer" />{ticket.customer}</span>{onAnalyze && <button onClick={onAnalyze} disabled={disabled}>Analyze <Icon name="arrow" /></button>}</div>
  </article>;
}
function CompletedDecisions({ evaluation }: { evaluation: Evaluation }) {
  return <div className="ticket-decisions">
    <div><span>Issue type</span><strong>{evaluation.issueType.choice}</strong></div>
    <div><span>Workflow</span><strong>{evaluation.workflow.choice}</strong></div>
    <div><span>Repository</span><strong>{evaluation.repository.choice}</strong></div>
    <div><span>Core workflow</span><strong>{evaluation.core >= 0.5 ? "Yes" : "No"}</strong></div>
    <div><span>Churn risk</span><strong>{evaluation.churn.toFixed(1)} / 10</strong></div>
    <div><span>Severity</span><strong>{evaluation.severity.toFixed(1)} / 10</strong></div>
  </div>;
}
function ChoicePanel({ title, icon, result }: { title: string; icon: IconName; result: ChoiceResult }) {
  const entries = Object.entries(result.probabilities).sort((a, b) => b[1] - a[1]);
  return <div className="result-block"><div className="result-label"><Icon name={icon} /> Choice · {title}</div><div className="choice-options">{entries.map(([name, value]) => <div className={`option ${name === result.choice ? "selected" : ""}`} key={name}><span>{name}{name === result.choice && <b>✓</b>}</span><span>{Math.round(value * 100)}%</span><i style={{ width: `${Math.max(value * 100, 1)}%` }} /></div>)}</div></div>;
}
export default function Home() {
  const [customTickets, setCustomTickets] = useState<Ticket[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState({ title: "", customer: "", source: "Support", context: "" });
  const allTickets = [...tickets, ...customTickets];
  const [active, setActive] = useState<string | null>(null);
  const [viewed, setViewed] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Evaluation>>({});
  const [result, setResult] = useState<Evaluation | null>(null);
  const [stage, setStage] = useState(0);
  const [status, setStatus] = useState<"idle" | "moving-in" | "loading" | "revealing" | "moving-out" | "error">("idle");
  const [error, setError] = useState("");
  const [flying, setFlying] = useState<{ ticket: Ticket; from: DOMRect; to: DOMRect; moving: boolean } | null>(null);
  const queueRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const centerRef = useRef<HTMLDivElement>(null);
  const bucketRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const runRef = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const current = allTickets.find((ticket) => ticket.id === (active ?? viewed));
  const displayedResult = result ?? (viewed ? results[viewed] : null);
  const displayedStage = active ? stage : viewed ? 7 : 0;
  const pause = (callback: () => void, ms: number) => timers.current.push(setTimeout(callback, ms));
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function move(ticket: Ticket, from: DOMRect | undefined, to: DOMRect | undefined, done: () => void) {
    if (!from || !to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { done(); return; }
    setFlying({ ticket, from, to, moving: false });
    requestAnimationFrame(() => requestAnimationFrame(() => setFlying({ ticket, from, to, moving: true })));
    pause(() => { setFlying(null); done(); }, 620);
  }
  async function analyze(ticket: Ticket) {
    if (active) return;
    timers.current.forEach(clearTimeout); timers.current = [];
    const run = ++runRef.current;
    setViewed(null); setActive(ticket.id); setResult(null); setStage(0); setError(""); setStatus("moving-in");
    const source = queueRefs.current[ticket.id]?.getBoundingClientRect();
    const target = centerRef.current?.getBoundingClientRect();
    move(ticket, source, target, async () => {
      if (run !== runRef.current) return;
      setStatus("loading");
      try {
        const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: ticket.id, ...(ticket.id.startsWith("CUSTOM-") ? { ticket } : {}) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Analysis failed. Please try again.");
        if (run !== runRef.current) return;
        const evaluation = data as Evaluation;
        setResult(evaluation); setStatus("revealing");
        for (let i = 1; i <= 7; i++) pause(() => setStage(i), i * 460);
        pause(() => {
          setStatus("moving-out");
          const from = centerRef.current?.getBoundingClientRect();
          const to = bucketRefs.current[evaluation.bucket]?.getBoundingClientRect();
          move(ticket, from, to, () => { setResults((old) => ({ ...old, [ticket.id]: evaluation })); setActive(null); setStatus("idle"); setResult(null); setStage(0); });
        }, 3760);
      } catch (cause) { if (run === runRef.current) { setError(cause instanceof Error ? cause.message : "Analysis failed."); setStatus("error"); } }
    });
  }
  function resetError() { setActive(null); setResult(null); setStatus("idle"); setError(""); }
  function addTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draft.title.trim();
    const customer = draft.customer.trim();
    const context = draft.context.trim();
    if (!title || !customer || !context) return;
    setCustomTickets((old) => [...old, { id: `CUSTOM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, title, customer, source: draft.source, context }]);
    setDraft({ title: "", customer: "", source: "Support", context: "" });
    setFormOpen(false);
  }
  const remaining = allTickets.filter((ticket) => !results[ticket.id]);
  return <main className="demo">
    <div className="flow-board"><section className="incoming-lane"><div className="lane-label"><span className="lane-dot"/> Incoming tickets <span className="lane-count">{remaining.length}</span></div><button type="button" className="new-ticket-toggle" onClick={() => setFormOpen((open) => !open)} aria-expanded={formOpen}>{formOpen ? "Cancel" : "+ New ticket"}</button>{formOpen && <form className="new-ticket-form" onSubmit={addTicket}><label>Issue<input required maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What went wrong?" /></label><label>Customer<input required maxLength={80} value={draft.customer} onChange={(event) => setDraft({ ...draft, customer: event.target.value })} placeholder="Who reported it?" /></label><label>Source<select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}><option>Support</option><option>QA</option><option>Crash report</option><option>App review</option><option>Customer Success</option></select></label><label>Context<textarea required maxLength={600} rows={3} value={draft.context} onChange={(event) => setDraft({ ...draft, context: event.target.value })} placeholder="What happens, and how does it affect them?" /></label><button type="submit">Add to incoming</button></form>}<div className="ticket-stack">{remaining.map((ticket) => <div key={ticket.id} ref={(node) => { queueRefs.current[ticket.id] = node; }} className={active === ticket.id ? "source-active" : ""}><TicketCard ticket={ticket} onAnalyze={() => analyze(ticket)} disabled={!!active} /></div>)}{remaining.length === 0 && <p className="empty-note">All tickets analyzed.</p>}</div></section>
    <section className={`evaluation ${active || viewed ? "evaluating" : ""}`} aria-label="Jev analysis"><div className="engine-heading"><span className="engine-mark">j</span><div><h2>Jev analysis</h2><span>{status === "loading" ? "Analyzing ticket…" : status === "revealing" || status === "moving-out" ? "Decision taking shape" : status === "error" ? "Analysis interrupted" : viewed ? "Completed analysis" : "Select a ticket to begin"}</span></div><i className={`engine-light ${active ? "on" : ""}`} />{viewed && !active && <button className="close-analysis" onClick={() => setViewed(null)} aria-label="Close analysis">×</button>}</div><div className="evaluation-slot" ref={centerRef}>{current && status !== "moving-in" && status !== "moving-out" ? <TicketCard ticket={current} compact /> : <span className="slot-hint">{status === "moving-in" ? "Receiving ticket…" : "One ticket. A few decisions."}</span>}</div>
    {status === "error" && <div className="error-message" role="alert">{error}<button onClick={resetError}>Return to queue</button></div>}
    <div className="result-list" aria-live="polite">{displayedResult && <>{displayedStage >= 1 && <ChoicePanel title="Issue type" icon="workflow" result={displayedResult.issueType} />}{displayedStage >= 2 && <ChoicePanel title="Workflow" icon="workflow" result={displayedResult.workflow} />}{displayedStage >= 3 && <ChoicePanel title="Repository" icon="repository" result={displayedResult.repository} />}{displayedStage >= 4 && <div className="result-block"><div className="result-label"><Icon name="core"/> Noul</div><div className="binary-row"><span>Core workflow affected?</span><strong>{displayedResult.core >= 0.5 ? "Yes" : "No"} <small>{Math.round((displayedResult.core >= 0.5 ? displayedResult.core : 1 - displayedResult.core) * 100)}%</small></strong></div></div>}{displayedStage >= 5 && <div className="result-block score-row"><div className="result-label"><Icon name="churn"/> Score · Churn risk</div><strong>{displayedResult.churn.toFixed(1)} <small>/ 10</small></strong></div>}{displayedStage >= 6 && <div className="result-block score-row"><div className="result-label"><Icon name="severity"/> Score · Severity</div><strong>{displayedResult.severity.toFixed(1)} <small>/ 10</small></strong></div>}{displayedStage >= 7 && <div className="result-block recommendation"><span>Recommended action</span><strong>{displayedResult.bucket} <Icon name="arrow" /></strong></div>}</>}</div></section>
    <section className="action-lane"><div className="lane-label"><span className="lane-dot"/> Recommended action <span className="lane-count">{Object.keys(results).length}</span></div>{buckets.map((bucket, index) => <div className="bucket" key={bucket} ref={(node) => { bucketRefs.current[bucket] = node; }}><div className="bucket-heading"><Icon name={index === 0 ? "fix" : index === 1 ? "sprint" : "backlog"}/><strong>{bucket}</strong><span>{Object.values(results).filter((value) => value.bucket === bucket).length}</span></div>{allTickets.filter((ticket) => results[ticket.id]?.bucket === bucket).map((ticket) => <button type="button" className={`landed-ticket ${viewed === ticket.id ? "selected" : ""}`} key={ticket.id} onClick={() => { if (!active) setViewed(ticket.id); }} disabled={!!active} aria-label={`Show full analysis for ${ticket.title}`} aria-pressed={viewed === ticket.id}><h3>{ticket.title}</h3><p>{ticket.customer}</p><CompletedDecisions evaluation={results[ticket.id]} /></button>)}</div>)}</section>
    {flying && <div className={`flying-ticket ${flying.moving ? "moving" : ""}`} style={{ left: flying.moving ? flying.to.left : flying.from.left, top: flying.moving ? flying.to.top : flying.from.top, width: flying.moving ? flying.to.width : flying.from.width }}><TicketCard ticket={flying.ticket} compact /></div>}</div>
    </main>;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "search" | "audit" | "verify";
interface Quote { step: Step; runs: number; estimateUsd: number; worstCaseUsd: number; perRunCapUsd: number; maxStepCostUsd: number; priceSource: string }
interface Result { runs: number; spentUsd: number; changed: number; stoppedForBudget: boolean; errors: string[] }

const LABEL: Record<Step, string> = { search: "Search Google Maps", audit: "Audit websites", verify: "Verify emails" };

/** Each step: free quote, the user confirms a maximum, then the paid run. */
export function StepPanel({ campaignId, pagesFetched, counts }: { campaignId: string; pagesFetched: number; counts: { leads: number; toAudit: number; toVerify: number } }) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [max, setMax] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  async function ask(step: Step) {
    setMsg(null);
    const res = await fetch(`/api/campaigns/${campaignId}/quote?step=${step}`);
    const q = await res.json();
    if (!res.ok) return setMsg({ text: q.error ?? "No quote.", bad: true });
    if (!q.runs) return setMsg({ text: step === "audit" ? "No websites left to audit." : "No emails left to verify.", bad: false });
    setQuote(q);
    setMax(String(Math.min(q.maxStepCostUsd, Math.max(0.01, Math.ceil(q.estimateUsd * 150) / 100))));
  }

  async function run() {
    if (!quote) return;
    setBusy(true);
    const res = await fetch(`/api/campaigns/${campaignId}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: quote.step, maxCostUsd: Number(max) }) });
    const r = (await res.json()) as Result & { error?: string };
    setBusy(false);
    setQuote(null);
    if (!res.ok) return setMsg({ text: r.error ?? "The step failed.", bad: true });
    setMsg({
      text: `${r.runs} runs, $${r.spentUsd.toFixed(4)}, ${r.changed} leads updated.${r.stoppedForBudget ? " Stopped at your limit." : ""}${r.errors.length ? ` ${r.errors.length} failed: ${r.errors.slice(0, 2).join("; ")}` : ""}`,
      bad: r.errors.length > 0 && r.changed === 0,
    });
    router.refresh();
  }

  return (
    <div className="card">
      <div className="row">
        <button onClick={() => ask("search")} disabled={busy}>{LABEL.search}{pagesFetched ? ` (page ${pagesFetched + 1})` : ""}</button>
        <button onClick={() => ask("audit")} disabled={busy || !counts.toAudit}>{LABEL.audit} ({counts.toAudit})</button>
        <button onClick={() => ask("verify")} disabled={busy || !counts.toVerify}>{LABEL.verify} ({counts.toVerify})</button>
      </div>
      {quote && (
        <div className="quote">
          <p>
            {LABEL[quote.step]}: {quote.runs} looot runs, estimated <strong>${quote.estimateUsd.toFixed(4)}</strong> at today&apos;s cheapest prices ({quote.priceSource}).
            Each run is capped at ${quote.perRunCapUsd}; worst case ${quote.worstCaseUsd.toFixed(2)}.
          </p>
          <div className="row">
            <label className="inline">Maximum spend $<input type="number" step="0.01" min="0.01" max={quote.maxStepCostUsd} value={max} onChange={(e) => setMax(e.target.value)} /></label>
            <button className="primary" onClick={run} disabled={busy || !(Number(max) > 0)}>{busy ? "Running..." : `Run (max $${max})`}</button>
            <button onClick={() => setQuote(null)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className={msg.bad ? "err" : "ok"}>{msg.text}</p>}
    </div>
  );
}

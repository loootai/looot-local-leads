import { NextResponse } from "next/server";
import { loadCampaign, STEPS } from "@/lib/campaignRoute";
import { SupabaseStore } from "@/lib/store";
import { QuoteError, runStep, type Step } from "@/lib/steps";
import { fetchPrices } from "@/lib/prices";
import { loootFromEnv } from "@/lib/looot";
import { readLimits } from "@/lib/limits";

export const maxDuration = 300;

/** Paid. Runs one step after the user confirmed a maximum spend; refuses when the estimate is above it. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = (await req.json().catch(() => ({}))) as { step?: Step; maxCostUsd?: number };
  const step = body.step as Step;
  if (!STEPS.includes(step)) return NextResponse.json({ error: "step must be search, audit or verify" }, { status: 400 });
  const maxCostUsd = Number(body.maxCostUsd);
  const limits = readLimits();
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) return NextResponse.json({ error: "Confirm a maximum spend first (maxCostUsd)." }, { status: 400 });
  if (maxCostUsd > limits.maxStepCostUsd) {
    return NextResponse.json({ error: `The server limit for one step is $${limits.maxStepCostUsd}. Raise MAX_STEP_COST_USD to allow more.` }, { status: 400 });
  }
  const loaded = await loadCampaign((await params).id);
  if ("error" in loaded) return loaded.error;
  const { db, campaign } = loaded;
  try {
    const { prices } = await fetchPrices();
    const r = await runStep(step, { campaign, runner: loootFromEnv(), store: new SupabaseStore(db), prices, maxCostUsd, perRunCapUsd: limits.perRunCapUsd });
    await db.from("step_runs").insert({
      owner_id: campaign.owner_id,
      campaign_id: campaign.id,
      step,
      runs: r.runs,
      changed: r.changed,
      estimate_usd: r.estimateUsd,
      max_cost_usd: maxCostUsd,
      spent_usd: r.spentUsd,
      stopped_for_budget: r.stoppedForBudget,
      errors: r.errors.slice(0, 20),
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof QuoteError) return NextResponse.json({ error: e.message, estimateUsd: e.estimateUsd }, { status: 409 });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

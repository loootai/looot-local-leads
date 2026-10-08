import { NextResponse } from "next/server";
import { loadCampaign, STEPS } from "@/lib/campaignRoute";
import { SupabaseStore } from "@/lib/store";
import { estimateStep, type Step } from "@/lib/steps";
import { fetchPrices } from "@/lib/prices";
import { readLimits } from "@/lib/limits";

/** Free. What one step would cost, before anything runs. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const step = new URL(req.url).searchParams.get("step") as Step;
  if (!STEPS.includes(step)) return NextResponse.json({ error: "step must be search, audit or verify" }, { status: 400 });
  const loaded = await loadCampaign((await params).id);
  if ("error" in loaded) return loaded.error;
  const leads = await new SupabaseStore(loaded.db).leads(loaded.campaign.id);
  const { prices, source } = await fetchPrices();
  const limits = readLimits();
  const q = estimateStep(step, leads, prices);
  return NextResponse.json({ step, ...q, worstCaseUsd: Math.round(q.runs * limits.perRunCapUsd * 1e6) / 1e6, perRunCapUsd: limits.perRunCapUsd, maxStepCostUsd: limits.maxStepCostUsd, priceSource: source });
}

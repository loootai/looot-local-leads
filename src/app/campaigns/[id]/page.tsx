import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { LEAD_COLUMNS } from "@/lib/store";
import { StepPanel } from "@/components/StepPanel";
import { LeadsTable, type LeadRow } from "@/components/LeadsTable";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await serverSupabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: campaign } = await db.from("campaigns").select("id, name, query, location, pages_fetched").eq("id", id).maybeSingle();
  if (!campaign) notFound();
  const { data: leads } = await db.from("leads").select(LEAD_COLUMNS).eq("campaign_id", id).order("score", { ascending: false }).order("name").limit(1000);
  const rows = (leads ?? []) as unknown as LeadRow[];
  const { data: runs } = await db.from("step_runs").select("created_at, step, runs, changed, spent_usd, stopped_for_budget").eq("campaign_id", id).order("created_at", { ascending: false }).limit(5);
  const spent = (runs ?? []).reduce((s, r) => s + Number(r.spent_usd), 0);

  const counts = {
    leads: rows.length,
    toAudit: rows.filter((r) => r.website && !r.audited_at).length,
    toVerify: rows.filter((r) => r.email && !r.email_status).length,
  };

  return (
    <>
      <header className="bar">
        <h1>{campaign.name}</h1>
        <Link href="/" className="small">All campaigns</Link>
      </header>
      <StepPanel campaignId={id} pagesFetched={campaign.pages_fetched} counts={counts} />
      {runs && runs.length > 0 && (
        <p className="muted small">
          Last steps: {runs.map((r) => `${r.step} (${r.changed} updated, $${Number(r.spent_usd).toFixed(4)}${r.stopped_for_budget ? ", stopped at limit" : ""})`).join(" · ")}. Shown here: ${spent.toFixed(4)}.
        </p>
      )}
      <LeadsTable rows={rows} campaignName={campaign.name} />
    </>
  );
}

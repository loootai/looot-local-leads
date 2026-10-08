import Link from "next/link";
import { redirect } from "next/navigation";
import { serverSupabase } from "@/lib/supabase/server";
import { NewCampaignForm } from "@/components/NewCampaignForm";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const db = await serverSupabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data } = await db.from("campaigns").select("id, name, query, location, created_at, leads(count)").order("created_at", { ascending: false });
  const campaigns = (data ?? []) as unknown as { id: string; name: string; query: string; location: string; created_at: string; leads: { count: number }[] }[];

  return (
    <>
      <header className="bar"><h1>Campaigns</h1></header>
      <div className="card">
        <h2>New campaign</h2>
        <p className="muted small">A business type and a place, as you would type them into Google Maps.</p>
        <NewCampaignForm />
      </div>
      {campaigns.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Campaign</th><th>Search</th><th>Leads</th><th>Created</th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><Link href={`/campaigns/${c.id}`}><strong>{c.name}</strong></Link></td>
                  <td>{c.query} in {c.location}</td>
                  <td>{c.leads?.[0]?.count ?? 0}</td>
                  <td className="small">{new Date(c.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

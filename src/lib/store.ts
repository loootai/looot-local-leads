import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campaign, Lead, NewLead, Store } from "./steps";

export const LEAD_COLUMNS =
  "id, place_key, name, category, address, phone, website, rating, reviews, maps_url, gaps, score, email, email_source, email_status, audited_at, status, notes";

/** Step store backed by the Supabase tables in supabase/migrations. Runs as the signed-in user. */
export class SupabaseStore implements Store {
  constructor(private readonly db: SupabaseClient) {}

  async leads(campaignId: string): Promise<Lead[]> {
    const { data, error } = await this.db.from("leads").select(LEAD_COLUMNS).eq("campaign_id", campaignId).limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({ ...r, rating: r.rating === null ? null : Number(r.rating) })) as Lead[];
  }

  async insertLeads(c: Campaign, leads: NewLead[]): Promise<number> {
    if (!leads.length) return 0;
    const rows = leads.map((l) => ({ ...l, owner_id: c.owner_id, campaign_id: c.id }));
    const { data, error } = await this.db.from("leads").upsert(rows, { onConflict: "campaign_id,place_key", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  }

  async updateLead(id: string, patch: Partial<Lead>): Promise<void> {
    const { error } = await this.db.from("leads").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async pageFetched(c: Campaign): Promise<void> {
    const { error } = await this.db.from("campaigns").update({ pages_fetched: c.pages_fetched + 1 }).eq("id", c.id);
    if (error) throw new Error(error.message);
  }
}

import { NextResponse } from "next/server";
import { serverSupabase } from "./supabase/server";
import type { Campaign, Step } from "./steps";

export const STEPS: Step[] = ["search", "audit", "verify"];

/** Loads the signed-in user's campaign, or returns the error response to send. */
export async function loadCampaign(id: string) {
  const db = await serverSupabase();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) } as const;
  const { data } = await db.from("campaigns").select("id, owner_id, query, location, pages_fetched").eq("id", id).maybeSingle();
  if (!data) return { error: NextResponse.json({ error: "Campaign not found." }, { status: 404 }) } as const;
  return { db, campaign: data as Campaign } as const;
}

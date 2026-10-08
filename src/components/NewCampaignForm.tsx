"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase/browser";

export function NewCampaignForm() {
  const router = useRouter();
  const [f, setF] = useState({ query: "", location: "" });
  const [err, setErr] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const query = f.query.trim();
    const location = f.location.trim();
    if (!query || !location) return setErr("Add a business type and a place.");
    const { data, error } = await browserSupabase().from("campaigns").insert({ name: `${query} in ${location}`, query, location }).select("id").single();
    if (error) return setErr(error.message);
    router.push(`/campaigns/${data.id}`);
  }
  return (
    <form onSubmit={create} className="form-grid">
      <label>Business type<input value={f.query} onChange={(e) => setF({ ...f, query: e.target.value })} placeholder="dentist" required /></label>
      <label>Place<input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Lyon, France" required /></label>
      {err && <p className="err">{err}</p>}
      <div><button className="primary" type="submit">Create campaign</button></div>
    </form>
  );
}

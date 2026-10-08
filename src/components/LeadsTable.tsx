"use client";

import { useMemo, useState } from "react";
import { browserSupabase } from "@/lib/supabase/browser";
import { GAP_LABELS, type Gap } from "@/lib/audit";
import { toCsv } from "@/lib/csv";

export interface LeadRow {
  id: string;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews: number | null;
  maps_url: string | null;
  gaps: Gap[];
  score: number;
  email: string | null;
  email_source: string | null;
  email_status: string | null;
  audited_at: string | null;
  status: string;
}

const STATUSES = ["new", "contacted", "replied", "won", "lost", "skip"];
const COLUMNS: (keyof LeadRow & string)[] = ["name", "category", "address", "phone", "website", "rating", "reviews", "score", "gaps", "email", "email_status", "email_source", "status", "maps_url"];

export function LeadsTable({ rows, campaignName }: { rows: LeadRow[]; campaignName: string }) {
  const [status, setStatus] = useState<Record<string, string>>({});
  const [onlyEmail, setOnlyEmail] = useState(false);
  const shown = useMemo(() => rows.filter((r) => !onlyEmail || (r.email && r.email_status !== "invalid")), [rows, onlyEmail]);

  async function setLeadStatus(id: string, s: string) {
    setStatus((m) => ({ ...m, [id]: s }));
    await browserSupabase().from("leads").update({ status: s }).eq("id", id);
  }

  function exportCsv() {
    const csv = toCsv(shown.map((r) => ({ ...r, status: status[r.id] ?? r.status })) as unknown as Record<string, unknown>[], COLUMNS);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${campaignName.replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
    a.click();
  }

  if (!rows.length) return <div className="card"><p className="muted">No leads yet. Run the Google Maps search first.</p></div>;
  return (
    <>
      <div className="row bar">
        <label className="inline"><input type="checkbox" checked={onlyEmail} onChange={(e) => setOnlyEmail(e.target.checked)} style={{ width: "auto" }} /> Only leads with a usable email</label>
        <button onClick={exportCsv}>Export CSV ({shown.length})</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Score</th><th>Business</th><th>Rating</th><th>Website gaps</th><th>Email</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td><span className="score">{r.score}</span></td>
                <td>
                  <strong>{r.maps_url ? <a href={r.maps_url} target="_blank" rel="noreferrer noopener">{r.name}</a> : r.name}</strong>
                  <div className="muted small">{[r.category, r.address, r.phone].filter(Boolean).join(" · ")}</div>
                  {r.website && <a className="small" href={r.website} target="_blank" rel="noreferrer noopener">{r.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>}
                </td>
                <td className="small">{r.rating ?? "-"} ({r.reviews ?? 0})</td>
                <td>
                  {r.gaps.map((g) => <span key={g} className="chip">{GAP_LABELS[g] ?? g}</span>)}
                  {r.website && !r.audited_at && <span className="muted small">not audited</span>}
                </td>
                <td className="small">{r.email ? <>{r.email}<div className={`em ${r.email_status ?? ""}`}>{r.email_status ?? "not verified"}</div></> : <span className="muted">-</span>}</td>
                <td>
                  <select value={status[r.id] ?? r.status} onChange={(e) => setLeadStatus(r.id, e.target.value)}>
                    {STATUSES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

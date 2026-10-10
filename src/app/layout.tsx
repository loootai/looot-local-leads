import type { Metadata } from "next";
import "./globals.css";
import { AppShell, type NavItem, type SpendLine } from "@/components/AppShell";
import { readLimits } from "@/lib/limits";
import { serverSupabase } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "looot local leads",
  description: "Local business prospect lists for agencies: Google Maps search, website gap audit, verified emails. Powered by looot and Supabase.",
  icons: { icon: "/brand/looot-mark.svg" },
};

/** Applies the saved theme before first paint, so a dark choice does not flash light. */
const THEME_SCRIPT = `try{var t=localStorage.getItem("looot-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t;else if(matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.dataset.theme="dark"}catch(e){}`;

const RECENT_HEADING = "Recent campaigns";

async function readSidebar(): Promise<{ items: NavItem[]; groups: Record<string, string>; spend: SpendLine[] | null }> {
  const items: NavItem[] = [{ href: "/", label: "Campaigns", icon: "campaigns" }];
  const groups: Record<string, string> = {};
  try {
    const db = await serverSupabase();
    const { data: auth } = await db.auth.getUser();
    if (!auth.user) return { items, groups, spend: null };
    const { data: recent } = await db.from("campaigns").select("id, name").order("created_at", { ascending: false }).limit(8);
    for (const c of recent ?? []) {
      const href = `/campaigns/${c.id}`;
      items.push({ href, label: c.name, icon: "tables" });
      groups[href] = RECENT_HEADING;
    }
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const { data: runs } = await db.from("step_runs").select("spent_usd").gte("created_at", since.toISOString());
    const month = (runs ?? []).reduce((sum, r) => sum + Number(r.spent_usd), 0);
    const { maxStepCostUsd } = readLimits();
    return {
      items,
      groups,
      spend: [
        { label: "This month", value: `$${month.toFixed(4)}` },
        { label: "Cap per step", value: `$${maxStepCostUsd.toFixed(2)}` },
      ],
    };
  } catch {
    return { items, groups, spend: null };
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { items, groups, spend } = await readSidebar();
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <AppShell items={items} groups={groups} spend={spend}>{children}</AppShell>
      </body>
    </html>
  );
}

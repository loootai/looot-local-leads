import { FALLBACK_PRICES, JOBS, type JobId } from "./steps";

interface OverviewJob {
  id: string;
  cheapestPerCall?: number | null;
  cheapestPerResult?: number | null;
}
interface Overview {
  categories?: { platforms?: { jobs?: OverviewJob[] }[] }[];
}

/** Results one call returns, used when a job is priced per result. */
const RESULTS_PER_CALL: Record<JobId, number> = { "maps.local.search": 20, "web.scrape.markdown": 1, "people.email.verify": 1 };

/** Cheapest price of one call for each job this app uses, from a catalog overview answer. */
export function priceMapFromOverview(overview: Overview): Record<JobId, number> {
  const out: Record<JobId, number> = { ...FALLBACK_PRICES };
  const wanted = new Set<string>(Object.values(JOBS));
  for (const c of overview.categories ?? [])
    for (const p of c.platforms ?? [])
      for (const j of p.jobs ?? []) {
        if (!wanted.has(j.id)) continue;
        const id = j.id as JobId;
        const perCall = typeof j.cheapestPerCall === "number" ? j.cheapestPerCall : 0;
        const perResult = typeof j.cheapestPerResult === "number" ? j.cheapestPerResult * RESULTS_PER_CALL[id] : 0;
        const price = Math.max(perCall, perResult);
        if (price > 0) out[id] = Math.round(price * 1e6) / 1e6;
      }
  return out;
}

/** Free, no key needed. Current prices from the public catalog overview, cached for an hour. */
export async function fetchPrices(baseUrl = process.env.LOOOT_API_URL ?? "https://api.looot.ai", f: typeof fetch = fetch) {
  try {
    const res = await f(`${baseUrl.replace(/\/+$/, "")}/v1/catalog/overview?depth=jobs`, { next: { revalidate: 3600 } } as RequestInit);
    if (!res.ok) return { prices: { ...FALLBACK_PRICES }, source: "fallback" as const };
    return { prices: priceMapFromOverview((await res.json()) as Overview), source: "catalog" as const };
  } catch {
    return { prices: { ...FALLBACK_PRICES }, source: "fallback" as const };
  }
}

/** Website and listing gaps an agency can pitch on, with the weight each adds to the lead score. */
export const GAP_WEIGHTS = {
  no_website: 3,
  site_unreachable: 3,
  outdated_site: 2,
  no_booking: 2,
  no_https: 1,
  no_email_on_site: 1,
  thin_site: 1,
  low_rating: 1,
  few_reviews: 1,
} as const;

export type Gap = keyof typeof GAP_WEIGHTS;

export const GAP_LABELS: Record<Gap, string> = {
  no_website: "no website",
  site_unreachable: "site did not load",
  outdated_site: "copyright older than 2 years",
  no_booking: "no booking or contact form link",
  no_https: "no https",
  no_email_on_site: "no email on the site",
  thin_site: "under 150 words",
  low_rating: "rating under 4.0",
  few_reviews: "under 20 reviews",
};

/** Gaps known from the Maps listing alone, before any paid page read. */
export function listingGaps(p: { website: string | null; rating: number | null; reviews: number | null }): Gap[] {
  const gaps: Gap[] = [];
  if (!p.website) gaps.push("no_website");
  else if (p.website.startsWith("http://")) gaps.push("no_https");
  if (p.rating !== null && p.rating < 4) gaps.push("low_rating");
  if (p.reviews !== null && p.reviews < 20) gaps.push("few_reviews");
  return gaps;
}

const BOOKING = /\b(book( now| online| an? appointment)?|booking|appointments?|reserve|reservation|schedule|calendly|doctolib|zocdoc|opentable|resy|fresha|treatwell|setmore|acuity)\b/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const ASSET = /\.(png|jpe?g|gif|svg|webp|css|js)$/i;

/** Public emails on a page, own-domain addresses first, without image names and placeholders. */
export function findEmails(markdown: string, domain: string | null): string[] {
  const found = [...new Set((markdown.match(EMAIL) ?? []).map((e) => e.toLowerCase().replace(/^mailto:/, "")))].filter(
    (e) => !ASSET.test(e) && !/^(example|test|your|name|email|user)@/.test(e) && !/@(example\.(com|org|net)|sentry\.io|wixpress\.com|domain\.com)$/.test(e),
  );
  const own = (e: string) => (domain && e.endsWith(`@${domain}`) ? 0 : 1);
  return found.sort((a, b) => own(a) - own(b));
}

/** Absolute link to a contact page on the same site, when the page has one. */
export function findContactLink(markdown: string, pageUrl: string): string | null {
  const base = new URL(pageUrl);
  for (const m of markdown.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (!/contact|kontakt|contacto|contatti/i.test(m[1])) continue;
    try {
      const u = new URL(m[1], base);
      if (u.hostname.replace(/^www\./, "") === base.hostname.replace(/^www\./, "") && u.pathname !== base.pathname) return u.toString();
    } catch {
      // not a URL
    }
  }
  return null;
}

/** Gaps found by reading the homepage. `now` makes the copyright check testable. */
export function siteGaps(markdown: string | null, now = new Date()): Gap[] {
  if (!markdown) return ["site_unreachable"];
  const gaps: Gap[] = [];
  const years = [...markdown.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1]));
  if (years.length && Math.max(...years) < now.getFullYear() - 2) gaps.push("outdated_site");
  if (!BOOKING.test(markdown)) gaps.push("no_booking");
  if (markdown.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length < 150) gaps.push("thin_site");
  return gaps;
}

/** Sum of gap weights. Higher means more for an agency to fix. */
export function scoreGaps(gaps: Gap[]): number {
  return [...new Set(gaps)].reduce((s, g) => s + GAP_WEIGHTS[g], 0);
}

/** Domain of a website URL without www. */
export function domainOf(website: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Maps a verification run to valid, catch_all, risky, invalid or unknown. */
export function emailStatus(run: { normalized?: Record<string, unknown> | null; result?: unknown }): string {
  // looot puts the mapped values of a job under normalized.fields; older shapes put them on normalized itself.
  const n = { ...((run.normalized?.fields as Record<string, unknown> | undefined) ?? {}), ...(run.normalized ?? {}) } as Record<string, unknown>;
  const r = (typeof run.result === "object" && run.result !== null ? run.result : {}) as Record<string, unknown>;
  const raw = String(n.status ?? r.status ?? r.result ?? r.verdict ?? (r.data as Record<string, unknown> | undefined)?.status ?? "").toLowerCase();
  if (/catch.?all|accept.?all/.test(raw)) return "catch_all";
  if (/^(valid|deliverable|ok|safe)$/.test(raw) || n.deliverable === true) return "valid";
  if (/invalid|undeliverable|bounce|not.?valid|disposable/.test(raw) || n.deliverable === false) return "invalid";
  if (/risky|unknown|accept|role/.test(raw)) return raw.includes("risky") ? "risky" : "unknown";
  return "unknown";
}

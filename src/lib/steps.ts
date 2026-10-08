import { costOf, type LoootRun } from "./looot";
import { extractPlaces, type Place } from "./places";
import { domainOf, emailStatus, findContactLink, findEmails, listingGaps, scoreGaps, siteGaps, type Gap } from "./audit";

export const JOBS = { search: "maps.local.search", page: "web.scrape.markdown", verify: "people.email.verify" } as const;
export type JobId = (typeof JOBS)[keyof typeof JOBS];
export type Step = "search" | "audit" | "verify";

/** Cheapest provider per call on 2026-10-08, used when the catalog cannot be read. */
export const FALLBACK_PRICES: Record<JobId, number> = {
  "maps.local.search": 0.0108, // $0.000539 per result x 20 results, above the $0.001 per-call price
  "web.scrape.markdown": 0.001, // per-result price of one page, above the $0.0002 per-call price
  "people.email.verify": 0.00145,
};

export interface Campaign {
  id: string;
  owner_id: string;
  query: string;
  location: string;
  pages_fetched: number;
}

export interface Lead extends Place {
  id: string;
  gaps: Gap[];
  score: number;
  email: string | null;
  email_status: string | null;
  email_source: string | null;
  audited_at: string | null;
}

export type NewLead = Omit<Lead, "id">;

export interface Store {
  leads(campaignId: string): Promise<Lead[]>;
  insertLeads(campaign: Campaign, leads: NewLead[]): Promise<number>;
  updateLead(id: string, patch: Partial<Lead>): Promise<void>;
  pageFetched(campaign: Campaign): Promise<void>;
}

export interface Runner {
  runAndWait(jobId: string, input: Record<string, unknown>, idempotencyKey: string, maxCostUsd: number): Promise<LoootRun>;
}

/** How many runs of which job a step makes. Audit counts two page reads per site: home and contact page. */
export function planStep(step: Step, leads: Lead[]): { job: JobId; runs: number } {
  if (step === "search") return { job: JOBS.search, runs: 1 };
  if (step === "audit") return { job: JOBS.page, runs: leads.filter((l) => l.website && !l.audited_at).length * 2 };
  return { job: JOBS.verify, runs: leads.filter((l) => l.email && !l.email_status).length };
}

export function estimateStep(step: Step, leads: Lead[], prices: Record<JobId, number>): { runs: number; estimateUsd: number } {
  const { job, runs } = planStep(step, leads);
  return { runs, estimateUsd: round(runs * prices[job]) };
}

export class QuoteError extends Error {
  constructor(
    message: string,
    readonly estimateUsd: number,
  ) {
    super(message);
    this.name = "QuoteError";
  }
}

export interface StepResult {
  step: Step;
  runs: number;
  spentUsd: number;
  estimateUsd: number;
  changed: number;
  stoppedForBudget: boolean;
  errors: string[];
}

interface Ctx {
  campaign: Campaign;
  runner: Runner;
  store: Store;
  prices: Record<JobId, number>;
  maxCostUsd: number;
  perRunCapUsd: number;
  now?: Date;
}

/** Spend tracker: lowers each run's cap to what is left and says when the next run no longer fits. */
class Budget {
  spent = 0;
  runs = 0;
  stopped = false;
  constructor(private readonly ctx: Ctx) {}
  async run(job: JobId, input: Record<string, unknown>, key: string): Promise<LoootRun | null> {
    const cap = Math.min(this.ctx.perRunCapUsd, this.ctx.maxCostUsd - this.spent);
    if (cap < this.ctx.prices[job]) {
      this.stopped = true;
      return null;
    }
    const run = await this.ctx.runner.runAndWait(job, input, key, round(cap));
    this.runs += 1;
    this.spent = round(this.spent + (costOf(run) ?? (run.status === "completed" ? this.ctx.prices[job] : 0)));
    return run;
  }
}

/**
 * Runs one step of a campaign. Refuses before any paid call when the estimate is above maxCostUsd,
 * and never lets the spend pass it while running.
 */
export async function runStep(step: Step, ctx: Ctx): Promise<StepResult> {
  const leads = await ctx.store.leads(ctx.campaign.id);
  const { estimateUsd } = estimateStep(step, leads, ctx.prices);
  if (estimateUsd > ctx.maxCostUsd) {
    throw new QuoteError(`This step is estimated at $${estimateUsd.toFixed(4)}, above your limit of $${ctx.maxCostUsd.toFixed(4)}.`, estimateUsd);
  }
  const budget = new Budget(ctx);
  const errors: string[] = [];
  let changed = 0;
  const c = ctx.campaign;

  const guard = async (label: string, fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (e) {
      errors.push(`${label}: ${(e as Error).message}`);
    }
  };

  if (step === "search") {
    const page = c.pages_fetched + 1;
    await guard("search", async () => {
      const run = await budget.run(JOBS.search, { query: c.query, location: c.location, ...(page > 1 ? { page } : {}) }, `ll-${c.id}-search-p${page}`);
      if (!run) return;
      if (run.status !== "completed") throw new Error(run.error?.message ?? run.status);
      const known = new Set(leads.map((l) => l.place_key));
      const fresh = extractPlaces(run.result).filter((p) => !known.has(p.place_key));
      changed = await ctx.store.insertLeads(
        c,
        fresh.map((p) => {
          const gaps = listingGaps(p);
          return { ...p, gaps, score: scoreGaps(gaps), email: null, email_status: null, email_source: null, audited_at: null };
        }),
      );
      await ctx.store.pageFetched(c);
    });
  }

  if (step === "audit") {
    for (const lead of leads.filter((l) => l.website && !l.audited_at)) {
      if (budget.stopped) break;
      await guard(lead.name, async () => {
        const home = await budget.run(JOBS.page, { url: lead.website }, `ll-${lead.id}-home`);
        if (!home) return;
        const md = home.status === "completed" ? readMarkdown(home) : null;
        const domain = domainOf(lead.website);
        let emails = md ? findEmails(md, domain) : [];
        let source = lead.website;
        const contact = md && !emails.length ? findContactLink(md, lead.website!) : null;
        if (contact) {
          const page = await budget.run(JOBS.page, { url: contact }, `ll-${lead.id}-contact`);
          const cmd = page?.status === "completed" ? readMarkdown(page) : null;
          if (cmd) {
            emails = findEmails(cmd, domain);
            source = contact;
          }
        }
        const gaps = [...listingGaps(lead), ...siteGaps(md, ctx.now)];
        if (md && !emails.length) gaps.push("no_email_on_site");
        await ctx.store.updateLead(lead.id, {
          gaps,
          score: scoreGaps(gaps),
          email: emails[0] ?? null,
          email_source: emails[0] ? source : null,
          audited_at: (ctx.now ?? new Date()).toISOString(),
        });
        changed += 1;
      });
    }
  }

  if (step === "verify") {
    for (const lead of leads.filter((l) => l.email && !l.email_status)) {
      if (budget.stopped) break;
      await guard(lead.name, async () => {
        const run = await budget.run(JOBS.verify, { email: lead.email }, `ll-${lead.id}-verify-${lead.email}`);
        if (!run) return;
        if (run.status !== "completed") throw new Error(run.error?.message ?? run.status);
        await ctx.store.updateLead(lead.id, { email_status: emailStatus(run) });
        changed += 1;
      });
    }
  }

  return { step, runs: budget.runs, spentUsd: budget.spent, estimateUsd, changed, stoppedForBudget: budget.stopped, errors };
}

function readMarkdown(run: LoootRun): string | null {
  const r = run.result as Record<string, unknown> | string | null | undefined;
  const c = [run.normalized?.markdown, typeof r === "string" ? r : r?.markdown, typeof r === "object" && r ? r.text ?? r.content : undefined];
  for (const v of c) if (typeof v === "string" && v.trim()) return v;
  return null;
}

function round(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

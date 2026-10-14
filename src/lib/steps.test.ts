import { describe, expect, it, vi } from "vitest";
import { FALLBACK_PRICES, QuoteError, estimateStep, runStep, type Campaign, type Lead, type NewLead, type Store } from "./steps";
import type { LoootRun } from "./looot";

const at = (local: string, host: string) => `${local}@${host}`;
const NOW = new Date("2026-10-08T00:00:00Z");
const prices = FALLBACK_PRICES;
const campaign: Campaign = { id: "c1", owner_id: "u1", query: "dentist", location: "Lyon, France", pages_fetched: 0 };
const longText = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ");

class MemoryStore implements Store {
  rows: Lead[] = [];
  pages = 0;
  async leads() {
    return this.rows.map((r) => ({ ...r }));
  }
  async insertLeads(_c: Campaign, leads: NewLead[]) {
    leads.forEach((l, i) => this.rows.push({ ...l, id: `l${this.rows.length + i}` }));
    return leads.length;
  }
  async updateLead(id: string, patch: Partial<Lead>) {
    Object.assign(this.rows.find((r) => r.id === id)!, patch);
  }
  async pageFetched() {
    this.pages += 1;
  }
}

/** Fake looot that answers by job and URL, honours the cap like looot does, and records calls. */
function fake(answer: (job: string, input: Record<string, unknown>) => unknown, cost = 0.001) {
  const calls: { job: string; input: Record<string, unknown>; key: string; cap: number }[] = [];
  return {
    calls,
    runAndWait: vi.fn(async (job: string, input: Record<string, unknown>, key: string, cap: number): Promise<LoootRun> => {
      calls.push({ job, input, key, cap });
      const result = answer(job, input);
      if (result === "FAIL") return { runId: key, status: "failed", error: { message: "provider error" }, actualCost: 0 };
      return { runId: key, status: "completed", result, actualCost: Math.min(cost, cap) };
    }),
  };
}

const mapsAnswer = {
  places: [
    { title: "No Site Dental", address: "1 rue A", rating: 3.8, ratingCount: 9, cid: "p1" },
    { title: "Old Site Dental", address: "2 rue B", rating: 4.7, ratingCount: 140, cid: "p2", website: "https://old-site.test" },
    { title: "Good Site Dental", address: "3 rue C", rating: 4.9, ratingCount: 400, cid: "p3", website: "https://good-site.test" },
  ],
};

function web(_job: string, input: Record<string, unknown>) {
  const url = String(input.url);
  if (url.startsWith("https://old-site.test/contact")) return { markdown: `Mail ${at("rdv", "old-site.test")}` };
  if (url.startsWith("https://old-site.test")) return { markdown: "Bienvenue. [Contact](/contact) © 2017 Old Site" };
  return { markdown: `${longText} [Book online](https://good-site.test/book) ${at("hello", "good-site.test")} © 2026` };
}

describe("search", () => {
  it("adds places with listing gaps and scores, once per place", async () => {
    const store = new MemoryStore();
    const runner = fake(() => mapsAnswer);
    const r = await runStep("search", { campaign, runner, store, prices, maxCostUsd: 0.05, perRunCapUsd: 0.03, now: NOW });
    expect(r).toMatchObject({ runs: 1, changed: 3, stoppedForBudget: false });
    expect(runner.calls[0]).toMatchObject({ job: "maps.local.search", input: { query: "dentist", q: "dentist", location: "Lyon, France" }, key: "ll-c1-search-p1", cap: 0.03 });
    expect(store.rows.find((l) => l.place_key === "p1")).toMatchObject({ gaps: ["no_website", "low_rating", "few_reviews"], score: 5 });
    expect(store.pages).toBe(1);
    const again = await runStep("search", { campaign: { ...campaign, pages_fetched: 1 }, runner: fake(() => mapsAnswer), store, prices, maxCostUsd: 0.05, perRunCapUsd: 0.03 });
    expect(again.changed).toBe(0);
  });
});

describe("audit", () => {
  it("reads each site, follows the contact page only when the homepage has no email, and scores gaps", async () => {
    const store = new MemoryStore();
    await runStep("search", { campaign, runner: fake(() => mapsAnswer), store, prices, maxCostUsd: 0.05, perRunCapUsd: 0.03 });
    expect(estimateStep("audit", await store.leads(), prices)).toEqual({ runs: 4, estimateUsd: 0.004 });
    const runner = fake(web, 0.0002);
    const r = await runStep("audit", { campaign, runner, store, prices, maxCostUsd: 0.01, perRunCapUsd: 0.03, now: NOW });
    expect(r.changed).toBe(2);
    expect(runner.calls.map((c) => c.input.url)).toEqual(["https://old-site.test/", "https://old-site.test/contact", "https://good-site.test/"]);
    const old = store.rows.find((l) => l.place_key === "p2")!;
    expect(old).toMatchObject({ email: at("rdv", "old-site.test"), email_source: "https://old-site.test/contact" });
    expect(old.gaps).toEqual(["outdated_site", "no_booking", "thin_site"]);
    expect(old.score).toBe(5);
    expect(store.rows.find((l) => l.place_key === "p3")).toMatchObject({ gaps: [], score: 0, email: at("hello", "good-site.test") });
  });

  it("reads the page from normalized.fields.markdown, where looot puts it", async () => {
    const store = new MemoryStore();
    await runStep("search", { campaign, runner: fake(() => mapsAnswer), store, prices, maxCostUsd: 0.05, perRunCapUsd: 0.03 });
    const runner = fake(web, 0.0002);
    const inner = runner.runAndWait.getMockImplementation()!;
    runner.runAndWait.mockImplementation(async (...a) => {
      const run = await inner(...a);
      return { ...run, normalized: { fields: { markdown: (run.result as { markdown: string }).markdown } }, result: { code: "200", data: {} } };
    });
    await runStep("audit", { campaign, runner, store, prices, maxCostUsd: 0.01, perRunCapUsd: 0.03, now: NOW });
    expect(store.rows.find((l) => l.place_key === "p2")!.gaps).not.toContain("site_unreachable");
    expect(store.rows.find((l) => l.place_key === "p3")).toMatchObject({ gaps: [], email: at("hello", "good-site.test") });
  });

  it("marks a site that did not load", async () => {
    const store = new MemoryStore();
    await runStep("search", { campaign, runner: fake(() => mapsAnswer), store, prices, maxCostUsd: 0.05, perRunCapUsd: 0.03 });
    await runStep("audit", { campaign, runner: fake(() => "FAIL"), store, prices, maxCostUsd: 0.01, perRunCapUsd: 0.03, now: NOW });
    expect(store.rows.find((l) => l.place_key === "p2")!.gaps).toContain("site_unreachable");
  });
});

describe("verify and spend guard", () => {
  it("verifies found emails and stores the status", async () => {
    const store = new MemoryStore();
    await runStep("search", { campaign, runner: fake(() => mapsAnswer), store, prices, maxCostUsd: 0.05, perRunCapUsd: 0.03 });
    await runStep("audit", { campaign, runner: fake(web, 0.0002), store, prices, maxCostUsd: 0.01, perRunCapUsd: 0.03, now: NOW });
    const r = await runStep("verify", { campaign, runner: fake(() => ({ status: "valid" }), 0.00145), store, prices, maxCostUsd: 0.01, perRunCapUsd: 0.03 });
    expect(r).toMatchObject({ runs: 2, changed: 2, spentUsd: 0.0029 });
    expect(store.rows.filter((l) => l.email_status === "valid")).toHaveLength(2);
  });

  it("refuses before any paid call when the estimate is above the maximum", async () => {
    const runner = fake(() => mapsAnswer);
    await expect(runStep("search", { campaign, runner, store: new MemoryStore(), prices, maxCostUsd: 0.005, perRunCapUsd: 0.03 })).rejects.toBeInstanceOf(QuoteError);
    expect(runner.runAndWait).not.toHaveBeenCalled();
  });

  it("never spends past the maximum while running", async () => {
    const store = new MemoryStore();
    await runStep("search", { campaign, runner: fake(() => mapsAnswer), store, prices, maxCostUsd: 0.05, perRunCapUsd: 0.03 });
    const runner = fake(web, 0.002);
    const r = await runStep("audit", { campaign, runner, store, prices, maxCostUsd: 0.004, perRunCapUsd: 0.03, now: NOW });
    expect(r.spentUsd).toBeLessThanOrEqual(0.004);
    expect(r.stoppedForBudget).toBe(true);
    expect(runner.calls.every((c) => c.cap <= 0.004)).toBe(true);
  });
});

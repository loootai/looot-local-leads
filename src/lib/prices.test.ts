import { describe, expect, it, vi } from "vitest";
import { fetchPrices, priceMapFromOverview } from "./prices";
import { FALLBACK_PRICES } from "./steps";

describe("prices", () => {
  it("prices a Maps search at 20 results and a page read at one result", () => {
    const p = priceMapFromOverview({
      categories: [
        { platforms: [{ jobs: [{ id: "maps.local.search", cheapestPerCall: 0.001, cheapestPerResult: 0.000539 }, { id: "web.scrape.markdown", cheapestPerCall: 0.0002, cheapestPerResult: 0.001 }] }] },
      ],
    });
    expect(p["maps.local.search"]).toBeCloseTo(0.01078);
    expect(p["web.scrape.markdown"]).toBe(0.001);
    expect(p["people.email.verify"]).toBe(FALLBACK_PRICES["people.email.verify"]);
  });
  it("falls back when the catalog is down", async () => {
    const f = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await fetchPrices("https://api.example.com", f)).toEqual({ prices: FALLBACK_PRICES, source: "fallback" });
  });
});

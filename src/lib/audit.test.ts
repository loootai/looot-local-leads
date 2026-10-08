import { describe, expect, it } from "vitest";
import { domainOf, emailStatus, findContactLink, findEmails, listingGaps, scoreGaps, siteGaps } from "./audit";

const at = (local: string, host: string) => `${local}@${host}`;
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const NOW = new Date("2026-10-08T00:00:00Z");

describe("listingGaps", () => {
  it("flags no website, http, low rating and few reviews", () => {
    expect(listingGaps({ website: null, rating: 3.5, reviews: 4 })).toEqual(["no_website", "low_rating", "few_reviews"]);
    expect(listingGaps({ website: "http://a.test/", rating: 4.6, reviews: 300 })).toEqual(["no_https"]);
    expect(listingGaps({ website: "https://a.test/", rating: null, reviews: null })).toEqual([]);
  });
});

describe("siteGaps", () => {
  it("marks an unreachable site", () => expect(siteGaps(null, NOW)).toEqual(["site_unreachable"]));
  it("finds an old copyright, no booking link and a thin page", () => {
    expect(siteGaps("Welcome. © 2019 Cabinet A", NOW)).toEqual(["outdated_site", "no_booking", "thin_site"]);
  });
  it("passes a current site with a booking link and enough text", () => {
    expect(siteGaps(`${words(200)} [Book an appointment](https://a.test/book) © 2018-2026 Cabinet A`, NOW)).toEqual([]);
  });
});

describe("findEmails", () => {
  it("puts own-domain emails first and drops images and placeholders", () => {
    const md = `Write to ${at("hello", "gmail.com")} or ${at("contact", "cabinet-a.test")}. logo${at("2x", "cabinet-a.png")} ${at("your", "domain.com")}`;
    expect(findEmails(md, "cabinet-a.test")).toEqual([at("contact", "cabinet-a.test"), at("hello", "gmail.com")]);
  });
});

describe("findContactLink", () => {
  it("returns a same-site contact page", () => {
    expect(findContactLink("[Home](/) [Contact us](/contact) [x](https://other.test/contact)", "https://www.cabinet-a.test/")).toBe("https://www.cabinet-a.test/contact");
    expect(findContactLink("[About](/about)", "https://cabinet-a.test/")).toBeNull();
  });
});

describe("scoring and helpers", () => {
  it("sums weights once per gap", () => expect(scoreGaps(["no_website", "low_rating", "low_rating"])).toBe(4));
  it("reads the domain", () => expect(domainOf("https://www.Cabinet-A.test/x")).toBe("cabinet-a.test"));
  it.each([
    [{ normalized: { status: "valid" } }, "valid"],
    [{ result: { result: "deliverable" } }, "valid"],
    [{ result: { status: "catch_all" } }, "catch_all"],
    [{ result: { status: "undeliverable" } }, "invalid"],
    [{ result: { status: "risky" } }, "risky"],
    [{ result: {} }, "unknown"],
  ])("maps %j to %s", (run, s) => expect(emailStatus(run)).toBe(s));
});

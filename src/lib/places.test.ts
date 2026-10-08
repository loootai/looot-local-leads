import { describe, expect, it } from "vitest";
import { cleanWebsite, extractPlaces } from "./places";

describe("extractPlaces", () => {
  it("reads a Serper-style places answer", () => {
    const r = { places: [{ title: "Cabinet A", address: "1 rue X, Lyon", rating: 4.8, ratingCount: 212, category: "Dentist", phoneNumber: "+33 4 00 00 00 00", website: "https://cabinet-a.test/", cid: "123" }] };
    expect(extractPlaces(r)).toEqual([
      { place_key: "123", name: "Cabinet A", category: "Dentist", address: "1 rue X, Lyon", phone: "+33 4 00 00 00 00", website: "https://cabinet-a.test/", rating: 4.8, reviews: 212, maps_url: null },
    ]);
  });
  it("reads a SerpApi-style local_results answer with string numbers and drops social websites", () => {
    const r = { search_metadata: { id: "x" }, local_results: [{ title: "Cabinet B", address: "2 rue Y", rating: "3.9", reviews: "1,204", type: "Dentist", place_id: "abc", website: "https://www.facebook.com/cabinetb" }] };
    const [p] = extractPlaces(r);
    expect(p).toMatchObject({ place_key: "abc", rating: 3.9, reviews: 1204, website: null, category: "Dentist" });
  });
  it("dedupes and ignores unknown shapes", () => {
    const one = { name: "C", formatted_address: "3 rue Z", place_id: "p" };
    expect(extractPlaces({ data: { results: [one, one] } })).toHaveLength(1);
    expect(extractPlaces({ error: "x" })).toEqual([]);
  });
});

describe("cleanWebsite", () => {
  it("adds a scheme and refuses Google or social links", () => {
    expect(cleanWebsite("cabinet-a.test")).toBe("https://cabinet-a.test/");
    expect(cleanWebsite("https://maps.google.com/?cid=1")).toBeNull();
    expect(cleanWebsite("")).toBeNull();
  });
});

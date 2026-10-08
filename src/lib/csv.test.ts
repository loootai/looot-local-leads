import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("quotes, joins arrays and blocks formulas", () => {
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell(["no_website", "few_reviews"])).toBe("no_website; few_reviews");
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell(null)).toBe("");
    expect(toCsv([{ name: "A", score: 3 }], ["name", "score"])).toBe("name,score\nA,3\n");
  });
});

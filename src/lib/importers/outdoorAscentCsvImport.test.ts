import { describe, it, expect } from "vitest";
import { parseOutdoorAscentCsv } from "./outdoorAscentCsvImport";

// Synthetic CSV strings matching the real 8a.nu column header/quoting/
// "null"-sentinel format confirmed against a real sample export (data.csv,
// repo root - not committed as a fixture, see PROGRESS.md 2026-09-17).
// These are hand-written, not derived from the real file's content.
const HEADER =
  '"route_boulder","name","location_name","sector_name","area_name","country_code","date","type","sub_type","rating","project","tries","repeats","difficulty","perceived_hardness","comment","height","recommended","sits"';

describe("parseOutdoorAscentCsv", () => {
  it("parses a well-formed row into an OutdoorAscent", () => {
    const csv = `${HEADER}
"BOULDER","Erdbeerkante","Magic Wood","Kamel",,"CH","2026-08-18T12:00:00Z","f",,"0","0","1","null","6A",,"","null","0","null"`;

    const result = parseOutdoorAscentCsv(csv);
    expect(result.skipped).toEqual([]);
    expect(result.ascents).toHaveLength(1);
    expect(result.ascents[0]).toMatchObject({
      date: "2026-08-18T12:00:00Z",
      grade: "6A",
      name: "Erdbeerkante",
      crag: "Magic Wood",
      style: "Flash",
    });
    expect(result.ascents[0].id).toBeTruthy();
  });

  it("maps known ascent-style codes and falls back to the raw (uppercased) code for unknown ones", () => {
    const csv = `${HEADER}
"BOULDER","A","Crag",,,"CH","2026-01-01T12:00:00Z","rp",,"0","0","1","null","7A",,,"null","0","null"
"BOULDER","B","Crag",,,"CH","2026-01-02T12:00:00Z","xyz",,"0","0","1","null","7B",,,"null","0","null"`;

    const result = parseOutdoorAscentCsv(csv);
    expect(result.ascents.map((a) => a.style)).toEqual(["Redpoint", "XYZ"]);
  });

  it("treats the literal string 'null' and empty fields as absent, not as text", () => {
    const csv = `${HEADER}
"BOULDER",,"Crag",,,"CH","2026-01-01T12:00:00Z","null",,"0","0","1","null","6C",,,"null","0","null"`;

    const result = parseOutdoorAscentCsv(csv);
    expect(result.ascents).toHaveLength(1);
    expect(result.ascents[0].name).toBeUndefined();
    expect(result.ascents[0].style).toBeUndefined();
  });

  it("skips (not fabricates) a row missing the grade, and reports why", () => {
    const csv = `${HEADER}
"BOULDER","No Grade","Crag",,,"CH","2026-01-01T12:00:00Z","f",,"0","0","1","null","null",,,"null","0","null"`;

    const result = parseOutdoorAscentCsv(csv);
    expect(result.ascents).toHaveLength(0);
    expect(result.skipped).toEqual([{ line: 2, reason: "Missing difficulty/grade" }]);
  });

  it("skips a row missing the date, and reports why", () => {
    const csv = `${HEADER}
"BOULDER","No Date","Crag",,,"CH","null","f",,"0","0","1","null","6A",,,"null","0","null"`;

    const result = parseOutdoorAscentCsv(csv);
    expect(result.ascents).toHaveLength(0);
    expect(result.skipped).toEqual([{ line: 2, reason: "Missing date" }]);
  });

  it("handles quoted fields containing embedded commas and escaped quotes", () => {
    const csv = `${HEADER}
"BOULDER","Comma, Name","Magic Wood, CH",,,"CH","2026-01-01T12:00:00Z","f",,"0","0","1","null","6A",,"He said ""nice climb""","null","0","null"`;

    const result = parseOutdoorAscentCsv(csv);
    expect(result.ascents).toHaveLength(1);
    expect(result.ascents[0].name).toBe("Comma, Name");
    expect(result.ascents[0].crag).toBe("Magic Wood, CH");
    expect(result.ascents[0].notes).toBe('He said "nice climb"');
  });

  it("rejects a header missing the required date/difficulty columns instead of guessing", () => {
    const csv = `"name","location_name"\n"Erdbeerkante","Magic Wood"`;
    const result = parseOutdoorAscentCsv(csv);
    expect(result.ascents).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toMatch(/date.*difficulty/i);
  });

  it("returns empty results for empty input", () => {
    expect(parseOutdoorAscentCsv("")).toEqual({ ascents: [], skipped: [] });
  });

  it("is tolerant of column order (looks up by header name, not position)", () => {
    const csv = `"difficulty","date","name"
"6B","2026-02-02T12:00:00Z","Reordered"`;

    const result = parseOutdoorAscentCsv(csv);
    expect(result.ascents).toHaveLength(1);
    expect(result.ascents[0]).toMatchObject({ grade: "6B", date: "2026-02-02T12:00:00Z", name: "Reordered" });
  });

  it("assigns each ascent a unique id", () => {
    const csv = `${HEADER}
"BOULDER","A","Crag",,,"CH","2026-01-01T12:00:00Z","f",,"0","0","1","null","6A",,,"null","0","null"
"BOULDER","B","Crag",,,"CH","2026-01-02T12:00:00Z","f",,"0","0","1","null","6B",,,"null","0","null"`;

    const result = parseOutdoorAscentCsv(csv);
    expect(result.ascents).toHaveLength(2);
    expect(result.ascents[0].id).not.toBe(result.ascents[1].id);
  });
});

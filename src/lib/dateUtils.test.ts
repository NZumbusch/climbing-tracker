import { describe, it, expect } from "vitest";
import { getWeekDates, getWeekDateRange, toUtcDayIndex, incrementWeekId, decrementWeekId } from "./dateUtils";

describe("getWeekDates", () => {
  it("returns the UTC Monday-start/Sunday-end for a mid-year week", () => {
    const dates = getWeekDates("2026-W12");
    expect(dates).not.toBeNull();
    expect(dates!.start.toISOString().split("T")[0]).toBe("2026-03-16");
    expect(dates!.end.toISOString().split("T")[0]).toBe("2026-03-22");
  });

  it("handles a week-01 id that starts in the previous calendar year", () => {
    const dates = getWeekDates("2026-W01");
    expect(dates!.start.toISOString().split("T")[0]).toBe("2025-12-29");
    expect(dates!.end.toISOString().split("T")[0]).toBe("2026-01-04");
  });

  it("handles a week-52 id that ends before the calendar year rolls over", () => {
    const dates = getWeekDates("2025-W52");
    expect(dates!.start.toISOString().split("T")[0]).toBe("2025-12-22");
    expect(dates!.end.toISOString().split("T")[0]).toBe("2025-12-28");
  });

  it("returns null for a malformed week id", () => {
    expect(getWeekDates("not-a-week")).toBeNull();
    expect(getWeekDates("W1")).toBeNull();
  });
});

describe("getWeekDateRange (characterization - behaviour preserved across the getWeekDates extraction)", () => {
  it("formats a mid-year week", () => {
    expect(getWeekDateRange("2026-W12")).toBe("Mar 16 - Mar 22");
  });

  it("formats a week spanning a year boundary", () => {
    expect(getWeekDateRange("2026-W01")).toBe("Dec 29 - Jan 4");
  });

  it("returns an empty string for an empty or malformed id", () => {
    expect(getWeekDateRange("")).toBe("");
    expect(getWeekDateRange("garbage")).toBe("");
  });
});

describe("toUtcDayIndex", () => {
  it("is stable for a bare YYYY-MM-DD date", () => {
    expect(toUtcDayIndex("2026-03-02")).toBe(toUtcDayIndex("2026-03-02"));
  });

  it("collapses a full ISO datetime to the same day index as its calendar date", () => {
    expect(toUtcDayIndex("2026-03-02T23:59:59.999Z")).toBe(toUtcDayIndex("2026-03-02T00:00:00.000Z"));
    expect(toUtcDayIndex("2026-03-02")).toBe(toUtcDayIndex("2026-03-02T00:00:00.000Z"));
  });

  it("increases by exactly 1 per UTC calendar day, including across a month boundary", () => {
    expect(toUtcDayIndex("2026-03-01")).toBe(toUtcDayIndex("2026-02-28") + 1);
  });

  it("is unaffected by DST transitions (a plain UTC day-count, not local time)", () => {
    // US DST started 2026-03-08; a naive local-time day-diff would misfire here.
    expect(toUtcDayIndex("2026-03-09")).toBe(toUtcDayIndex("2026-03-08") + 1);
  });
});

describe("decrementWeekId", () => {
  it("is incrementWeekId's exact inverse for a mid-year week", () => {
    expect(decrementWeekId("2026-W26")).toBe("2026-W25");
    expect(incrementWeekId(decrementWeekId("2026-W26"))).toBe("2026-W26");
  });

  it("rolls under into the previous year at week 01", () => {
    expect(decrementWeekId("2026-W01")).toBe("2025-W52");
  });

  it("returns a malformed id unchanged", () => {
    expect(decrementWeekId("garbage")).toBe("garbage");
  });
});

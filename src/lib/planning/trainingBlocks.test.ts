import { describe, it, expect } from "vitest";
import { getBlocksForWeek, getDominantBlockForWeek } from "./trainingBlocks";
import type { TrainingBlock } from "../types";

function block(overrides: Partial<TrainingBlock> & Pick<TrainingBlock, "id" | "startWeekId" | "endWeekId">): TrainingBlock {
  return { name: overrides.id, phaseId: "phase-x", ...overrides };
}

describe("getBlocksForWeek", () => {
  it("returns blocks whose range covers the week, inclusive of both ends", () => {
    const blocks = [
      block({ id: "a", startWeekId: "2026-W01", endWeekId: "2026-W04" }),
      block({ id: "b", startWeekId: "2026-W05", endWeekId: "2026-W08" }),
    ];
    expect(getBlocksForWeek(blocks, "2026-W01").map((b) => b.id)).toEqual(["a"]);
    expect(getBlocksForWeek(blocks, "2026-W04").map((b) => b.id)).toEqual(["a"]);
    expect(getBlocksForWeek(blocks, "2026-W05").map((b) => b.id)).toEqual(["b"]);
    expect(getBlocksForWeek(blocks, "2026-W09")).toEqual([]);
  });

  it("handles overlapping blocks and cross-year ranges correctly (string comparison on zero-padded week ids)", () => {
    const blocks = [
      block({ id: "a", startWeekId: "2025-W50", endWeekId: "2026-W03" }),
      block({ id: "b", startWeekId: "2026-W01", endWeekId: "2026-W10" }),
    ];
    expect(getBlocksForWeek(blocks, "2026-W01").map((b) => b.id).sort()).toEqual(["a", "b"]);
    expect(getBlocksForWeek(blocks, "2025-W51").map((b) => b.id)).toEqual(["a"]);
    expect(getBlocksForWeek(blocks, "2026-W05").map((b) => b.id)).toEqual(["b"]);
  });
});

describe("getDominantBlockForWeek", () => {
  it("returns undefined when no block covers the week", () => {
    expect(getDominantBlockForWeek([], "2026-W01")).toBeUndefined();
  });

  it("returns the single covering block when there's no overlap", () => {
    const blocks = [block({ id: "a", startWeekId: "2026-W01", endWeekId: "2026-W04" })];
    expect(getDominantBlockForWeek(blocks, "2026-W02")?.id).toBe("a");
  });

  it("picks the higher-priority block when two overlap", () => {
    const blocks = [
      block({ id: "low", startWeekId: "2026-W01", endWeekId: "2026-W04", priority: 1 }),
      block({ id: "high", startWeekId: "2026-W02", endWeekId: "2026-W03", priority: 5 }),
    ];
    expect(getDominantBlockForWeek(blocks, "2026-W02")?.id).toBe("high");
  });

  it("treats missing priority as 0", () => {
    const blocks = [
      block({ id: "no-priority", startWeekId: "2026-W01", endWeekId: "2026-W04" }),
      block({ id: "negative", startWeekId: "2026-W01", endWeekId: "2026-W04", priority: -1 }),
    ];
    expect(getDominantBlockForWeek(blocks, "2026-W01")?.id).toBe("no-priority");
  });

  it("breaks ties by preferring the later block in the array (last-created wins)", () => {
    const blocks = [
      block({ id: "first", startWeekId: "2026-W01", endWeekId: "2026-W04", priority: 2 }),
      block({ id: "second", startWeekId: "2026-W01", endWeekId: "2026-W04", priority: 2 }),
    ];
    expect(getDominantBlockForWeek(blocks, "2026-W01")?.id).toBe("second");
  });
});

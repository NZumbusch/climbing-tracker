import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { runDataMigrations, assertMigrationInvariants } from "./storage";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): any {
  const raw = readFileSync(
    path.join(__dirname, "__fixtures__", name),
    "utf-8",
  );
  return JSON.parse(raw);
}

// Phase 4's migration work: PeriodizationWeek[] -> single-week
// TrainingBlock[] (startWeekId === endWeekId === the old weekId), the
// `customized` flag split out into a decoupled WeekOverride[] table, and a
// purely-additive `competitionEvents: []`. See PLAN.md Phase 4 Definition
// of Done.

describe("Phase 4: PeriodizationWeek -> single-week TrainingBlock conversion", () => {
  it("converts each periodization entry into a single-week block, resolving the block's name from the phase", () => {
    const data: any = {
      exportVersion: "3.22",
      workouts: [],
      exerciseTypes: [],
      periodization: [{ weekId: "2026-W05", phaseId: "phase-deload" }],
      templates: {},
      phaseDefs: [{ id: "phase-deload", name: "Deload", color: "bg-zinc-500", order: 7 }],
    };

    runDataMigrations(data);

    expect(data.periodization).toBeUndefined();
    expect(data.trainingBlocks).toHaveLength(1);
    const block = data.trainingBlocks[0];
    expect(block.phaseId).toBe("phase-deload");
    expect(block.startWeekId).toBe("2026-W05");
    expect(block.endWeekId).toBe("2026-W05");
    expect(block.name).toBe("Deload");
    expect(typeof block.id).toBe("string");
  });

  it("falls back to a generic name if the phaseId doesn't resolve against phaseDefs", () => {
    const data: any = {
      exportVersion: "3.22",
      workouts: [],
      exerciseTypes: [],
      periodization: [{ weekId: "2026-W05", phaseId: "phase-nonexistent" }],
      templates: {},
      phaseDefs: [],
    };

    runDataMigrations(data);

    expect(data.trainingBlocks[0].name).toBe("Training Block");
  });

  it("skips periodization entries with no phaseId (never creates a block for them)", () => {
    const data: any = {
      exportVersion: "3.22",
      workouts: [],
      exerciseTypes: [],
      periodization: [{ weekId: "2026-W05" }],
      templates: {},
      phaseDefs: [],
    };

    runDataMigrations(data);

    expect(data.trainingBlocks).toHaveLength(0);
  });

  it("splits the customized flag out into a decoupled WeekOverride entry, decoupled from the block", () => {
    const data: any = {
      exportVersion: "3.22",
      workouts: [],
      exerciseTypes: [],
      periodization: [
        { weekId: "2026-W05", phaseId: "phase-deload", customized: true },
        { weekId: "2026-W06", phaseId: "phase-deload" },
      ],
      templates: {},
      phaseDefs: [{ id: "phase-deload", name: "Deload" }],
    };

    runDataMigrations(data);

    expect(data.weekOverrides).toEqual([{ weekId: "2026-W05", customized: true }]);
    // Every trainingBlock is purely a phase/date-range record - `customized`
    // never leaks onto it.
    data.trainingBlocks.forEach((b: any) => expect(b.customized).toBeUndefined());
  });

  it("adds competitionEvents (empty by default, purely additive)", () => {
    const data: any = {
      exportVersion: "3.22",
      workouts: [],
      exerciseTypes: [],
      periodization: [],
      templates: {},
      phaseDefs: [],
    };

    runDataMigrations(data);

    expect(data.competitionEvents).toEqual([]);
  });
});

describe("Phase 4: assertMigrationInvariants checks TrainingBlock.phaseId resolution", () => {
  it("passes when every block's phaseId resolves", () => {
    const after: any = {
      workouts: [],
      benchmarks: [],
      exerciseTypes: [],
      phaseDefs: [{ id: "phase-deload", name: "Deload" }],
      trainingBlocks: [{ id: "b1", name: "Deload", phaseId: "phase-deload", startWeekId: "2026-W01", endWeekId: "2026-W01" }],
    };
    expect(() => assertMigrationInvariants({ workouts: [], benchmarks: [] }, after)).not.toThrow();
  });

  it("throws when a block's phaseId doesn't resolve against phaseDefs", () => {
    const after: any = {
      workouts: [],
      benchmarks: [],
      exerciseTypes: [],
      phaseDefs: [],
      trainingBlocks: [{ id: "b1", name: "Ghost", phaseId: "phase-ghost", startWeekId: "2026-W01", endWeekId: "2026-W01" }],
    };
    expect(() => assertMigrationInvariants({ workouts: [], benchmarks: [] }, after)).toThrow(/unresolvable phaseId/);
  });
});

describe("Phase 4: full old-to-new roundtrip (old_backup.json)", () => {
  it("converts real periodization data into valid TrainingBlocks and passes invariants", () => {
    const before = loadFixture("backup-2.1.json");
    const after = JSON.parse(JSON.stringify(before));
    runDataMigrations(after);

    expect(() => assertMigrationInvariants(before, after)).not.toThrow();

    expect(after.periodization).toBeUndefined();
    expect(Array.isArray(after.trainingBlocks)).toBe(true);
    expect(Array.isArray(after.weekOverrides)).toBe(true);
    expect(after.competitionEvents).toEqual([]);

    const knownPhaseIds = new Set(after.phaseDefs.map((p: any) => p.id));
    after.trainingBlocks.forEach((b: any) => {
      expect(b.startWeekId).toBe(b.endWeekId);
      expect(knownPhaseIds.has(b.phaseId)).toBe(true);
    });
  });
});

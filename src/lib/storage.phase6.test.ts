import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { runDataMigrations, assertMigrationInvariants } from "./storage";
import { DATA_EXPORT_VERSION, DEFAULT_METRIC_DEFS, BODYWEIGHT_METRIC_ID } from "./constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): any {
  const raw = readFileSync(path.join(__dirname, "__fixtures__", name), "utf-8");
  return JSON.parse(raw);
}

// Phase 6's migration work: seed the built-in `bodyweight` MetricDef
// (3.24->3.25) and add the purely-additive `outdoorAscents: []` (3.25->3.26).
// See PLAN.md Phase 6 / PROGRESS.md 2026-09-17.

describe("Phase 6: seed the built-in bodyweight MetricDef", () => {
  it("adds a bodyweight MetricDef when none exists", () => {
    const data: any = {
      exportVersion: "3.24",
      workouts: [],
      exerciseTypes: [],
      metricDefs: [{ id: "sleep-score", name: "Sleep Score", unit: "pts" }],
    };

    runDataMigrations(data);

    expect(data.metricDefs).toContainEqual({ id: BODYWEIGHT_METRIC_ID, name: "Bodyweight", unit: "kg" });
    expect(data.metricDefs).toHaveLength(2);
  });

  it("is a no-op if a bodyweight MetricDef already exists (idempotent)", () => {
    const existing = { id: BODYWEIGHT_METRIC_ID, name: "Bodyweight (custom)", unit: "lb" };
    const data: any = {
      exportVersion: "3.24",
      workouts: [],
      exerciseTypes: [],
      metricDefs: [existing],
    };

    runDataMigrations(data);

    expect(data.metricDefs).toEqual([existing]);
  });

  it("handles a missing metricDefs array (defaults to [] first)", () => {
    const data: any = { exportVersion: "3.24", workouts: [], exerciseTypes: [] };
    runDataMigrations(data);
    expect(data.metricDefs).toEqual([{ id: BODYWEIGHT_METRIC_ID, name: "Bodyweight", unit: "kg" }]);
  });
});

describe("Phase 6: add outdoorAscents (empty by default, purely additive)", () => {
  it("adds an empty outdoorAscents array", () => {
    const data: any = { exportVersion: "3.25", workouts: [], exerciseTypes: [] };
    runDataMigrations(data);
    expect(data.outdoorAscents).toEqual([]);
  });

  it("does not clobber existing outdoorAscents", () => {
    const existing = [{ id: "a1", date: "2026-01-01", grade: "7A" }];
    const data: any = { exportVersion: "3.25", workouts: [], exerciseTypes: [], outdoorAscents: existing };
    runDataMigrations(data);
    expect(data.outdoorAscents).toEqual(existing);
  });
});

describe("Phase 6: DEFAULT_METRIC_DEFS (fresh-install seed fix)", () => {
  it("includes all four well-known built-in metric ids, bodyweight among them", () => {
    const ids = DEFAULT_METRIC_DEFS.map((d) => d.id);
    expect(ids).toEqual(expect.arrayContaining(["sleep-score", "hrv", "rhr", BODYWEIGHT_METRIC_ID]));
    expect(ids).toHaveLength(4);
  });
});

describe("Phase 6: full old-to-new roundtrip (old_backup.json)", () => {
  it("migrates to the current version with a seeded bodyweight MetricDef and an empty outdoorAscents array", () => {
    const before = loadFixture("backup-2.1.json");
    const after = JSON.parse(JSON.stringify(before));
    runDataMigrations(after);

    expect(after.exportVersion).toBe(DATA_EXPORT_VERSION);
    expect(() => assertMigrationInvariants(before, after)).not.toThrow();

    expect(after.metricDefs.some((m: any) => m.id === BODYWEIGHT_METRIC_ID)).toBe(true);
    expect(Array.isArray(after.outdoorAscents)).toBe(true);
    expect(after.outdoorAscents).toEqual([]);
  });
});

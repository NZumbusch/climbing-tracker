import { describe, it, expect } from "vitest";
import { runDataMigrations } from "./storage";
import { resolveInitialExportVersion } from "./storage/persistence";
import { DATA_EXPORT_VERSION, DEFAULT_TEMPLATES, DEFAULT_EXERCISE_TYPES, DEFAULT_PHASE_DEFS, DEFAULT_BENCHMARK_TYPES, DEFAULT_ANALYTICS_CATEGORIES } from "./constants";

// Bug fix (found 2026-09-16, via a user report of duplicate/gray
// "phase-..." entries in Settings surviving a storage wipe): a true fresh
// install populates `_dbState` from the `DEFAULT_*` constants, which are
// already in the *current* schema shape - but `initDB` used to default a
// missing `exportVersion` to "1.0" unconditionally, so `runStartupMigrations`
// ran the entire migration chain over that already-current-shape data on
// every fresh install. Most historical steps happen to be idempotent
// against already-migrated data, but two were not: the Phase 3 templates
// step re-resolved already-correct phaseId keys as if they were phase
// *names* (creating an archived placeholder PhaseDef per phase, visible in
// Settings as gray duplicates named "phase-..."), and the Phase 1
// Exercise->ExerciseSlot restructure step double-nested `prescribed` on
// already-slotted default-template exercises (silently hiding every
// default template's exercise values - a corruption that predates Phase 3
// but was never caught because manual fresh-install testing was deferred
// to the user in every prior phase, and existing installs never exercise
// this path).

function buildFreshInstallDefaults(exportVersion: string) {
  return {
    workouts: [],
    trainingBlocks: [],
    weekOverrides: [],
    competitionEvents: [],
    templates: JSON.parse(JSON.stringify(DEFAULT_TEMPLATES)),
    phaseDefs: JSON.parse(JSON.stringify(DEFAULT_PHASE_DEFS)),
    exerciseTypes: JSON.parse(JSON.stringify(DEFAULT_EXERCISE_TYPES)),
    benchmarks: [],
    benchmarkTypes: JSON.parse(JSON.stringify(DEFAULT_BENCHMARK_TYPES)),
    analyticsCategories: JSON.parse(JSON.stringify(DEFAULT_ANALYTICS_CATEGORIES)),
    metricDefs: [],
    dailyMetrics: [],
    painLogs: [],
    exportVersion,
  };
}

describe("resolveInitialExportVersion", () => {
  it("pins a true fresh install (no workouts ever persisted) to the current version, skipping migrations entirely", () => {
    expect(resolveInitialExportVersion({ workouts: undefined, exportVersion: undefined })).toBe(DATA_EXPORT_VERSION);
    expect(resolveInitialExportVersion({ workouts: null as any, exportVersion: undefined })).toBe(DATA_EXPORT_VERSION);
  });

  it("still defaults a real pre-existing 1.0/2.0-era install (has workouts, even []) to 1.0", () => {
    expect(resolveInitialExportVersion({ workouts: [], exportVersion: undefined })).toBe("1.0");
  });

  it("uses the persisted exportVersion when present, regardless of workouts", () => {
    expect(resolveInitialExportVersion({ workouts: [], exportVersion: "2.5" })).toBe("2.5");
  });
});

describe("Fresh install: full migration chain is defense-in-depth safe even if forced over already-current-shape data", () => {
  // Covers the case where `resolveInitialExportVersion` is bypassed or a
  // future regression reintroduces the old "1.0" default - the individual
  // migration steps themselves should also not corrupt already-migrated
  // data, not just rely on never being asked to process it.
  it("does not create duplicate/archived PhaseDefs or double-nest ExerciseValues", () => {
    const data: any = buildFreshInstallDefaults("1.0");

    runDataMigrations(data);

    expect(data.phaseDefs).toHaveLength(7);
    expect(data.phaseDefs.every((p: any) => !p.archived)).toBe(true);

    const knownPhaseIds = new Set(data.phaseDefs.map((p: any) => p.id));
    Object.keys(data.templates).forEach((key) => expect(knownPhaseIds.has(key)).toBe(true));

    Object.values(data.templates).forEach((list: any) =>
      list.forEach((wt: any) =>
        wt.exercises.forEach((slot: any) => {
          expect(slot.prescribed).toBeTypeOf("object");
          expect(slot.prescribed.prescribed).toBeUndefined();
          expect(slot.logged).toBeUndefined();
        }),
      ),
    );
  });

  it("is a true no-op when exportVersion is already pinned to the current version (the real initDB path post-fix)", () => {
    const data: any = buildFreshInstallDefaults(DATA_EXPORT_VERSION);
    const before = JSON.parse(JSON.stringify(data));

    runDataMigrations(data);

    expect(data).toEqual(before);
  });
});

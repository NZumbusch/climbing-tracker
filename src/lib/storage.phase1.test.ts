import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { runDataMigrations, assertMigrationInvariants } from "./storage";
import { DEFAULT_TEMPLATES, DEFAULT_EXERCISE_TYPES } from "./constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): any {
  const raw = readFileSync(
    path.join(__dirname, "__fixtures__", name),
    "utf-8",
  );
  return JSON.parse(raw);
}

// Phase 1's biggest, highest-stakes migration step: flat Exercise[] ->
// ExerciseSlot[] with a prescribed/logged split. Each scenario below is one
// of the specific cases PLAN.md's Phase 1 Definition of Done calls out by
// name, plus the two gap-fills decided with the user before implementation
// (see PROGRESS.md 2026-09-16 "Phase 1 scope gap-fills").

describe("Phase 1: prescribed/logged split - (a) pre-3.12 completed workout, no plannedDuration", () => {
  it("sets prescribed === logged (honest limitation: no plan/actual distinction ever existed for this data)", () => {
    const data: any = {
      exportVersion: "3.11",
      workouts: [
        {
          id: "w1",
          status: "completed",
          date: "2026-01-01",
          weekId: "2026-W01",
          loadFactor: 10,
          exercises: [{ id: "e1", type: "Free Bouldering", duration: 45, sets: 3 }],
        },
      ],
      exerciseTypes: [{ id: "free-bouldering", name: "Free Bouldering", category: "Technique Bouldering", parameters: [] }],
      templates: {},
    };

    runDataMigrations(data);

    const slot = data.workouts[0].exercises[0];
    expect(slot.typeId).toBe("free-bouldering");
    expect(slot.prescribed.duration).toBe(45);
    expect(slot.logged.duration).toBe(45);
    expect(slot.prescribed.sets).toBe(3);
    expect(slot.logged.sets).toBe(3);
  });
});

describe("Phase 1: prescribed/logged split - (b) post-3.12 workout with plannedDuration/actualReps present", () => {
  it("splits duration into prescribed vs logged, and reps into prescribed vs logged", () => {
    const data: any = {
      exportVersion: "3.12",
      workouts: [
        {
          id: "w1",
          status: "completed",
          date: "2026-01-01",
          weekId: "2026-W01",
          loadFactor: 10,
          exercises: [
            { id: "e1", type: "Free Bouldering", duration: 50, plannedDuration: 60, reps: 3, actualReps: 5 },
          ],
        },
      ],
      exerciseTypes: [{ id: "free-bouldering", name: "Free Bouldering", category: "Technique Bouldering", parameters: [] }],
      templates: {},
    };

    runDataMigrations(data);

    const slot = data.workouts[0].exercises[0];
    expect(slot.prescribed.duration).toBe(60);
    expect(slot.logged.duration).toBe(50);
    expect(slot.prescribed.reps).toBe(3);
    expect(slot.logged.reps).toBe(5);
  });
});

describe("Phase 1: prescribed/logged split - (c) planned (not yet completed) workout", () => {
  it("populates prescribed only, leaving logged undefined", () => {
    const data: any = {
      exportVersion: "3.12",
      workouts: [
        {
          id: "w1",
          status: "planned",
          date: null,
          weekId: "2026-W01",
          loadFactor: 0,
          exercises: [{ id: "e1", type: "Free Bouldering", duration: 90 }],
        },
      ],
      exerciseTypes: [{ id: "free-bouldering", name: "Free Bouldering", category: "Technique Bouldering", parameters: [] }],
      templates: {},
    };

    runDataMigrations(data);

    const slot = data.workouts[0].exercises[0];
    expect(slot.prescribed.duration).toBe(90);
    expect(slot.logged).toBeUndefined();
  });
});

describe("Phase 1: prescribed/logged split - (d) unresolvable type/category names get archived placeholders", () => {
  it("creates an archived ExerciseTypeDef and AnalyticsCategory for names with no current match", () => {
    const data: any = {
      exportVersion: "3.12",
      workouts: [
        {
          id: "w1",
          status: "planned",
          date: null,
          weekId: "2026-W01",
          loadFactor: 0,
          exercises: [
            { id: "e1", type: "Long-Discontinued Modality", category: "Long-Discontinued Category", duration: 30 },
          ],
        },
      ],
      exerciseTypes: [],
      analyticsCategories: [],
      templates: {},
    };

    runDataMigrations(data);

    const slot = data.workouts[0].exercises[0];
    const resolvedType = data.exerciseTypes.find((t: any) => t.id === slot.typeId);
    expect(resolvedType).toBeDefined();
    expect(resolvedType.name).toBe("Long-Discontinued Modality");
    expect(resolvedType.archived).toBe(true);

    const resolvedCategory = data.analyticsCategories.find((c: any) => c.id === slot.categoryId);
    expect(resolvedCategory).toBeDefined();
    expect(resolvedCategory.name).toBe("Long-Discontinued Category");
    expect(resolvedCategory.archived).toBe(true);
  });

  it("reuses one placeholder per unique missing name rather than creating duplicates", () => {
    const data: any = {
      exportVersion: "3.12",
      workouts: [
        {
          id: "w1",
          status: "planned",
          date: null,
          weekId: "2026-W01",
          loadFactor: 0,
          exercises: [
            { id: "e1", type: "Ghost Modality" },
            { id: "e2", type: "Ghost Modality" },
          ],
        },
      ],
      exerciseTypes: [],
      templates: {},
    };

    runDataMigrations(data);

    const [slot1, slot2] = data.workouts[0].exercises;
    expect(slot1.typeId).toBe(slot2.typeId);
    expect(data.exerciseTypes.filter((t: any) => t.name === "Ghost Modality")).toHaveLength(1);
  });
});

describe("Phase 1: (e) full old-to-new roundtrip invariant check", () => {
  it("every real workout's exercises have a resolvable typeId, and invariants pass end to end", () => {
    const before = loadFixture("backup-2.1.json");
    const after = JSON.parse(JSON.stringify(before));
    runDataMigrations(after);

    expect(() => assertMigrationInvariants(before, after)).not.toThrow();

    const knownTypeIds = new Set(after.exerciseTypes.map((t: any) => t.id));
    after.workouts.forEach((w: any) => {
      w.exercises.forEach((e: any) => {
        expect(e.typeId).toBeTruthy();
        expect(knownTypeIds.has(e.typeId)).toBe(true);
      });
    });
  });
});

describe("Phase 1: (f) fresh-install/reset-to-default-library shape", () => {
  it("DEFAULT_TEMPLATES (no migration involved) already has valid typeId/prescribed-shaped exercises", () => {
    const knownTypeIds = new Set(DEFAULT_EXERCISE_TYPES.map((t) => t.id));
    let checkedAtLeastOne = false;

    Object.values(DEFAULT_TEMPLATES).forEach((phaseTemplates) => {
      phaseTemplates.forEach((workout) => {
        (workout.exercises || []).forEach((slot: any) => {
          checkedAtLeastOne = true;
          expect(typeof slot.id).toBe("string");
          expect(knownTypeIds.has(slot.typeId)).toBe(true);
          expect(slot.type).toBeUndefined();
          expect(slot.duration).toBeUndefined();
          expect(slot.prescribed).toBeTypeOf("object");
          expect(slot.logged).toBeUndefined();
        });
      });
    });

    expect(checkedAtLeastOne).toBe(true);
  });
});

describe("Phase 1: (g) frozen 2.3->2.4 Deload fallback stays old-shape safe", () => {
  function migrateMissingDeload() {
    const data: any = {
      exportVersion: "2.3",
      workouts: [],
      exerciseTypes: DEFAULT_EXERCISE_TYPES.map((t) => ({ ...t })),
      templates: {}, // no "Deload" key at all - triggers the 2.3->2.4 fallback
    };
    runDataMigrations(data);
    return data;
  }

  function assertValidDeloadSlot(data: any) {
    // Phase 3 rekeys templates from phase name to phaseId, so by the end of
    // the full chain the frozen "Deload" fallback content ends up under
    // "phase-deload", not "Deload" - see storage.migrations.test.ts's
    // "New: 3.13 -> 3.14 phase rename" tests for the equivalent rename
    // coverage on periodization.
    const deloadWorkouts = data.templates["phase-deload"];
    expect(deloadWorkouts).toBeDefined();
    expect(deloadWorkouts.length).toBeGreaterThan(0);

    const slot = deloadWorkouts[0].exercises[0];
    expect(slot.typeId).toBe("free-bouldering");
    expect(slot.prescribed).toBeTypeOf("object");
    // The historical corruption this fixture guards against: injecting the
    // new typeId/prescribed shape mid-chain would have produced a
    // double-nested `prescribed.prescribed` instead of a flat ExerciseValues.
    expect(slot.prescribed.prescribed).toBeUndefined();
    expect(slot.prescribed.duration).toBe(60);
    expect(slot.prescribed.climbingStyle).toEqual(["Slab"]);
  }

  it("migrates old data missing a Deload template key to a valid, non-double-nested ExerciseSlot", () => {
    assertValidDeloadSlot(migrateMissingDeload());
  });

  it("stays correct across repeated runs in the same process (guards the shared-constant mutation bug the deep-clone fix addresses)", () => {
    assertValidDeloadSlot(migrateMissingDeload());
    assertValidDeloadSlot(migrateMissingDeload());
  });
});

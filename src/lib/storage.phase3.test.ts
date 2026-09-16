import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { runDataMigrations, assertMigrationInvariants } from "./storage";
import { DEFAULT_TEMPLATES, DEFAULT_PHASE_DEFS, DEFAULT_EXERCISE_TYPES, DEFAULT_TEMPLATE_LIBRARY } from "./constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): any {
  const raw = readFileSync(
    path.join(__dirname, "__fixtures__", name),
    "utf-8",
  );
  return JSON.parse(raw);
}

// Phase 3's migration work: PhaseType (closed union) -> PhaseDef (data),
// PeriodizationWeek.phase (name) -> phaseId, and templates rekeyed from
// phase name to phaseId with a Partial<Workout> -> WorkoutTemplate shape
// change. See PLAN.md Phase 3 Definition of Done.

const ALL_SEVEN_PHASE_NAMES_TO_IDS: Record<string, string> = {
  Capacity: "phase-capacity",
  Strength: "phase-strength",
  Power: "phase-power",
  "Power Endurance": "phase-power-endurance",
  Performance: "phase-performance",
  Taper: "phase-taper",
  Deload: "phase-deload",
};

describe("Phase 3: all 7 legacy phase names map to the correct phaseIds", () => {
  it("resolves every canonical phase name to its fixed phaseId for periodization entries (now TrainingBlocks, Phase 4)", () => {
    const data: any = {
      exportVersion: "3.19",
      workouts: [],
      exerciseTypes: [],
      periodization: Object.keys(ALL_SEVEN_PHASE_NAMES_TO_IDS).map((name, i) => ({
        weekId: `2026-W${String(i + 1).padStart(2, "0")}`,
        phase: name,
      })),
      templates: {},
    };

    runDataMigrations(data);

    expect(data.periodization).toBeUndefined();
    const blockByWeek = new Map(data.trainingBlocks.map((b: any) => [b.startWeekId, b]));
    Object.keys(ALL_SEVEN_PHASE_NAMES_TO_IDS).forEach((name, i) => {
      const weekId = `2026-W${String(i + 1).padStart(2, "0")}`;
      const block = blockByWeek.get(weekId) as any;
      expect(block.phase).toBeUndefined();
      expect(block.phaseId).toBe(ALL_SEVEN_PHASE_NAMES_TO_IDS[name]);
      expect(block.endWeekId).toBe(weekId);
    });

    // Seeded even for names never referenced by this fixture's periodization.
    const seededIds = new Set(data.phaseDefs.map((p: any) => p.id));
    Object.values(ALL_SEVEN_PHASE_NAMES_TO_IDS).forEach((id) => {
      expect(seededIds.has(id)).toBe(true);
    });
  });

  it("rekeys templates from every canonical phase name to its phaseId, preserving content", () => {
    const data: any = {
      exportVersion: "3.19",
      workouts: [],
      exerciseTypes: [],
      periodization: [],
      templates: Object.fromEntries(
        Object.keys(ALL_SEVEN_PHASE_NAMES_TO_IDS).map((name) => [
          name,
          [{ notes: `${name} session`, dayOfWeek: "Monday", exercises: [] }],
        ]),
      ),
    };

    runDataMigrations(data);

    Object.entries(ALL_SEVEN_PHASE_NAMES_TO_IDS).forEach(([name, phaseId]) => {
      expect(data.templates[name]).toBeUndefined();
      const rekeyed = data.templates[phaseId];
      expect(rekeyed).toHaveLength(1);
      expect(rekeyed[0].name).toBe(`${name} session`);
      expect(rekeyed[0].dayOfWeek).toBe("Monday");
      expect(typeof rekeyed[0].id).toBe("string");
    });
  });
});

describe("Phase 3: unresolvable/custom phase name gets an archived placeholder PhaseDef", () => {
  it("never drops the reference - creates an archived PhaseDef instead", () => {
    const data: any = {
      exportVersion: "3.19",
      workouts: [],
      exerciseTypes: [],
      periodization: [{ weekId: "2026-W01", phase: "Homebrew Custom Block" }],
      templates: {},
    };

    runDataMigrations(data);

    const block = data.trainingBlocks[0];
    expect(block.phaseId).toBeTruthy();
    const resolved = data.phaseDefs.find((p: any) => p.id === block.phaseId);
    expect(resolved).toBeDefined();
    expect(resolved.name).toBe("Homebrew Custom Block");
    expect(resolved.archived).toBe(true);
  });

  it("reuses one placeholder per unique missing name across periodization and templates", () => {
    const data: any = {
      exportVersion: "3.19",
      workouts: [],
      exerciseTypes: [],
      periodization: [
        { weekId: "2026-W01", phase: "Ghost Phase" },
        { weekId: "2026-W02", phase: "Ghost Phase" },
      ],
      templates: {
        "Ghost Phase": [{ notes: "leftover template", exercises: [] }],
      },
    };

    runDataMigrations(data);

    const [b1, b2] = data.trainingBlocks;
    expect(b1.phaseId).toBe(b2.phaseId);
    expect(data.phaseDefs.filter((p: any) => p.name === "Ghost Phase")).toHaveLength(1);
    expect(data.templates[b1.phaseId]).toHaveLength(1);
  });
});

describe("Phase 3: full old-to-new roundtrip", () => {
  it("every training block's phaseId and templates key resolves against phaseDefs, invariants pass", () => {
    const before = loadFixture("backup-2.1.json");
    const after = JSON.parse(JSON.stringify(before));
    runDataMigrations(after);

    expect(() => assertMigrationInvariants(before, after)).not.toThrow();

    const knownPhaseIds = new Set(after.phaseDefs.map((p: any) => p.id));
    after.trainingBlocks.forEach((b: any) => {
      expect(b.phase).toBeUndefined();
      expect(b.phaseId).toBeTruthy();
      expect(knownPhaseIds.has(b.phaseId)).toBe(true);
    });
    Object.keys(after.templates).forEach((key) => {
      expect(knownPhaseIds.has(key)).toBe(true);
    });
  });
});

describe("Phase 3: fresh-install/reset-to-default-library shape", () => {
  it("DEFAULT_PHASE_DEFS has all 7 built-in phases with the fixed ids", () => {
    const ids = DEFAULT_PHASE_DEFS.map((p) => p.id).sort();
    expect(ids).toEqual(Object.values(ALL_SEVEN_PHASE_NAMES_TO_IDS).sort());
  });

  it("DEFAULT_TEMPLATES (no migration involved) is keyed by phaseId with valid WorkoutTemplate entries", () => {
    const knownPhaseIds = new Set(DEFAULT_PHASE_DEFS.map((p) => p.id));
    const knownTypeIds = new Set(DEFAULT_EXERCISE_TYPES.map((t) => t.id));
    let checkedAtLeastOne = false;

    Object.entries(DEFAULT_TEMPLATES).forEach(([phaseId, workoutTemplates]) => {
      expect(knownPhaseIds.has(phaseId)).toBe(true);
      workoutTemplates.forEach((wt) => {
        checkedAtLeastOne = true;
        expect(typeof wt.id).toBe("string");
        wt.exercises.forEach((slot) => {
          expect(knownTypeIds.has(slot.typeId)).toBe(true);
          expect(slot.logged).toBeUndefined();
        });
      });
    });

    expect(checkedAtLeastOne).toBe(true);
  });
});

describe("Phase 3: starter template library (placeholder content only, see PROGRESS.md)", () => {
  it("has at least one set, and every set's exercises resolve against DEFAULT_EXERCISE_TYPES", () => {
    expect(DEFAULT_TEMPLATE_LIBRARY.length).toBeGreaterThan(0);
    const knownTypeIds = new Set(DEFAULT_EXERCISE_TYPES.map((t) => t.id));

    DEFAULT_TEMPLATE_LIBRARY.forEach((set) => {
      expect(typeof set.id).toBe("string");
      expect(typeof set.name).toBe("string");
      Object.values(set.templates).forEach((workoutTemplates) => {
        workoutTemplates.forEach((wt) => {
          wt.exercises.forEach((slot) => {
            expect(knownTypeIds.has(slot.typeId)).toBe(true);
          });
        });
      });
    });
  });
});

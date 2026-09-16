import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { runDataMigrations } from "./storage";
import { DATA_EXPORT_VERSION } from "./constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): any {
  const raw = readFileSync(
    path.join(__dirname, "__fixtures__", name),
    "utf-8",
  );
  return JSON.parse(raw);
}

/** Every ExerciseValues bucket (prescribed and/or logged) present on a slot - for tests that just need to find a field "somewhere" without caring which bucket. */
function valueBuckets(slot: any): any[] {
  return [slot.prescribed, slot.logged].filter(Boolean);
}

describe("Prerequisite: DATA_EXPORT_VERSION", () => {
  it("is bumped to 3.24", () => {
    expect(DATA_EXPORT_VERSION).toBe("3.24");
  });
});

describe("Primary fixture: old_backup.json (exportVersion 2.1, real user data)", () => {
  it("runs the full chain without throwing and lands on the current version", () => {
    const data = loadFixture("backup-2.1.json");
    expect(() => runDataMigrations(data)).not.toThrow();
    expect(data.exportVersion).toBe("3.24");
  });

  it("preserves all 16 workouts", () => {
    const data = loadFixture("backup-2.1.json");
    runDataMigrations(data);
    expect(data.workouts).toHaveLength(16);
  });

  it("converts every workout and exercise id to a string", () => {
    const data = loadFixture("backup-2.1.json");
    runDataMigrations(data);
    data.workouts.forEach((w: any) => {
      expect(typeof w.id).toBe("string");
      w.exercises?.forEach((e: any) => {
        expect(typeof e.id).toBe("string");
      });
    });
  });

  it("preserves the 5 Non-Free Bouldering `variant` values by folding them into notes", () => {
    const data = loadFixture("backup-2.1.json");
    runDataMigrations(data);

    const allSlots = [
      ...data.workouts.flatMap((w: any) => w.exercises || []),
      ...Object.values(data.templates || {}).flatMap((temps: any) =>
        temps.flatMap((t: any) => t.exercises || []),
      ),
    ];

    // None should still carry a raw `variant` field (ExerciseSlot/ExerciseValues never had one).
    allSlots.forEach((e: any) => {
      expect(e.variant).toBeUndefined();
      valueBuckets(e).forEach((v) => expect(v.variant).toBeUndefined());
    });

    const withPreservedVariant = allSlots.filter((e: any) =>
      valueBuckets(e).some((v) => typeof v.notes === "string" && v.notes.includes("[Variant: 4x4]")),
    );
    expect(withPreservedVariant).toHaveLength(5);
  });

  it("renames boulderingStyle/hangboardTimes parameters and drops the old names", () => {
    const data = loadFixture("backup-2.1.json");
    runDataMigrations(data);

    data.exerciseTypes.forEach((t: any) => {
      expect(t.parameters).not.toContain("boulderingStyle");
      expect(t.parameters).not.toContain("hangboardTimes");
    });

    const freeBouldering = data.exerciseTypes.find(
      (t: any) => t.name === "Free Bouldering",
    );
    expect(freeBouldering.parameters).toContain("climbingStyle");

    const hangboard = data.exerciseTypes.find(
      (t: any) => t.name === "Hangboard",
    );
    expect(hangboard.parameters).toContain("timeOn");
  });

  it("renames Maintenance/Endurance phases and rekeys templates, with no leftovers", () => {
    const data = loadFixture("backup-2.1.json");
    runDataMigrations(data);

    // Phase 3 replaces `phase` (name) with `phaseId` entirely, and Phase 4
    // converts each periodization entry into a single-week TrainingBlock -
    // every block should now resolve against a real PhaseDef, and none
    // should carry the pre-3.14 legacy names.
    expect(data.periodization).toBeUndefined();
    const phaseNameById = new Map(data.phaseDefs.map((p: any) => [p.id, p.name]));
    data.trainingBlocks.forEach((b: any) => {
      expect(b.phase).toBeUndefined();
      expect(b.phaseId).toBeTruthy();
      expect(phaseNameById.get(b.phaseId)).not.toBe("Maintenance");
      expect(phaseNameById.get(b.phaseId)).not.toBe("Endurance");
    });

    expect(data.templates["Maintenance"]).toBeUndefined();
    expect(data.templates["Endurance"]).toBeUndefined();
  });
});

describe("Hand-built 1.0/2.0-era fixture (branch old_backup.json doesn't exercise)", () => {
  it("adds default benchmarks/benchmarkTypes for data with no exportVersion at all", () => {
    const data: any = {
      workouts: [
        { id: 1, status: "planned", date: null, weekId: "2026-W01", loadFactor: 0, exercises: [] },
      ],
      exerciseTypes: [],
      templates: {},
    };
    expect(() => runDataMigrations(data)).not.toThrow();
    expect(Array.isArray(data.benchmarks)).toBe(true);
    expect(Array.isArray(data.benchmarkTypes)).toBe(true);
    expect(data.benchmarkTypes.length).toBeGreaterThan(0);
    expect(data.exportVersion).toBe("3.24");
  });

  it('treats "2.0" the same as no version at all', () => {
    const data: any = {
      exportVersion: "2.0",
      workouts: [],
      exerciseTypes: [],
      templates: {},
    };
    runDataMigrations(data);
    expect(Array.isArray(data.benchmarks)).toBe(true);
    expect(Array.isArray(data.benchmarkTypes)).toBe(true);
  });
});

describe("Targeted boundary: 2.1 -> 2.2 field renames", () => {
  it("renames addedWeight -> weight, rungSize -> holdSize, and maps boulderingType", () => {
    const data: any = {
      exportVersion: "2.1",
      workouts: [
        {
          id: 1,
          status: "completed",
          date: "2026-01-01",
          weekId: "2026-W01",
          loadFactor: 0,
          exercises: [
            { id: 1, type: "Hangboard", addedWeight: 10, rungSize: 20 },
            { id: 2, type: "Free Bouldering", boulderingType: "Kilterboard" },
            { id: 3, type: "Free Bouldering", boulderingType: "Slab" },
          ],
        },
      ],
      exerciseTypes: [],
      templates: {},
    };

    runDataMigrations(data);

    const [hangboardEx, kilterEx, slabEx] = data.workouts[0].exercises;
    expect(hangboardEx.addedWeight).toBeUndefined();
    expect(hangboardEx.rungSize).toBeUndefined();
    expect(hangboardEx.prescribed.weight).toBe(10);
    expect(hangboardEx.prescribed.holdSize).toBe(20);

    expect(kilterEx.boulderingType).toBeUndefined();
    expect(kilterEx.prescribed.boardType).toBe("Kilterboard");
    expect(kilterEx.prescribed.climbingStyle).toEqual(["Board"]);

    expect(slabEx.boulderingType).toBeUndefined();
    expect(slabEx.prescribed.climbingStyle).toEqual(["Slab"]);
  });
});

describe("Targeted boundary: 2.8 -> 2.9 climbingStyle string -> array", () => {
  it("wraps a scalar climbingStyle value into a single-element array", () => {
    const data: any = {
      exportVersion: "2.8",
      workouts: [
        {
          id: 1,
          status: "completed",
          date: "2026-01-01",
          weekId: "2026-W01",
          loadFactor: 0,
          exercises: [{ id: 1, type: "Free Bouldering", climbingStyle: "Slab" }],
        },
      ],
      exerciseTypes: [],
      templates: {
        Capacity: [
          { exercises: [{ id: "t1", type: "Free Bouldering", climbingStyle: "Overhang" }] },
        ],
      },
    };

    runDataMigrations(data);

    expect(data.workouts[0].exercises[0].prescribed.climbingStyle).toEqual(["Slab"]);
    expect(data.templates["phase-capacity"][0].exercises[0].prescribed.climbingStyle).toEqual(["Overhang"]);
  });
});

describe("Targeted boundary: 3.4 -> 3.5 Boulder Intervals split", () => {
  it("splits into Rep-Based Intervals (variant/reps present) vs Time-Based Intervals", () => {
    const data: any = {
      exportVersion: "3.4",
      workouts: [
        {
          id: 1,
          status: "planned",
          date: null,
          weekId: "2026-W01",
          loadFactor: 0,
          exercises: [
            { id: 1, type: "Boulder Intervals", variant: "4x4" },
            { id: 2, type: "Boulder Intervals", reps: 5 },
            { id: 3, type: "Boulder Intervals" },
          ],
        },
      ],
      exerciseTypes: [
        { id: "boulder-intervals", name: "Boulder Intervals", category: "Power Bouldering", parameters: ["duration"] },
      ],
      templates: {},
    };

    runDataMigrations(data);

    const typeName = (typeId: string) => data.exerciseTypes.find((t: any) => t.id === typeId)?.name;
    const [variantEx, repsEx, plainEx] = data.workouts[0].exercises;
    expect(typeName(variantEx.typeId)).toBe("Rep-Based Intervals");
    expect(typeName(repsEx.typeId)).toBe("Rep-Based Intervals");
    expect(typeName(plainEx.typeId)).toBe("Time-Based Intervals");

    const ids = data.exerciseTypes.map((t: any) => t.id);
    expect(ids).not.toContain("boulder-intervals");
    expect(ids).toContain("time-based-intervals");
    expect(ids).toContain("rep-based-intervals");
  });
});

describe("Targeted boundary: amended 3.8 -> 3.9 (grade merge + variant preservation)", () => {
  it("preserves a variant on a non-Boulder-Intervals exercise by folding it into notes (the fix)", () => {
    const data: any = {
      exportVersion: "3.8",
      workouts: [
        {
          id: 1,
          status: "completed",
          date: "2026-01-01",
          weekId: "2026-W01",
          loadFactor: 0,
          exercises: [
            {
              id: 1,
              type: "Non-Free Bouldering",
              variant: "4x4",
              minRouteGrade: "V4",
              maxRouteGrade: "V6",
            },
          ],
        },
      ],
      exerciseTypes: [],
      templates: {},
    };

    runDataMigrations(data);

    const ex = data.workouts[0].exercises[0];
    expect(ex.variant).toBeUndefined();
    expect(ex.prescribed.notes).toBe("[Variant: 4x4]");
    expect(ex.prescribed.minGrade).toBe("V4");
    expect(ex.prescribed.maxGrade).toBe("V6");
  });

  it("appends to existing notes rather than overwriting them", () => {
    const data: any = {
      exportVersion: "3.8",
      workouts: [
        {
          id: 1,
          status: "completed",
          date: "2026-01-01",
          weekId: "2026-W01",
          loadFactor: 0,
          exercises: [
            { id: 1, type: "Non-Free Bouldering", variant: "4x4", notes: "Felt strong" },
          ],
        },
      ],
      exerciseTypes: [],
      templates: {},
    };

    runDataMigrations(data);
    expect(data.workouts[0].exercises[0].prescribed.notes).toBe("Felt strong [Variant: 4x4]");
  });

  it("is a no-op for already-migrated data with no variant field (data already past 3.9)", () => {
    const data: any = {
      exportVersion: "3.9",
      workouts: [
        {
          id: 1,
          status: "completed",
          date: "2026-01-01",
          weekId: "2026-W01",
          loadFactor: 0,
          exercises: [{ id: 1, type: "Non-Free Bouldering", notes: "Felt strong" }],
        },
      ],
      exerciseTypes: [],
      templates: {},
    };

    runDataMigrations(data);
    // The 3.8->3.9 step never ran (data started at 3.9) - notes untouched, no variant tag.
    expect(data.workouts[0].exercises[0].prescribed.notes).toBe("Felt strong");
  });
});

describe("New: 3.12 -> 3.13 parameter rename", () => {
  it("renames boulderingStyle -> climbingStyle and hangboardTimes -> timeOn everywhere", () => {
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
            { id: "e1", type: "Free Bouldering", activeParameters: ["boulderingStyle", "duration"] },
          ],
        },
      ],
      exerciseTypes: [
        { id: "free-bouldering", name: "Free Bouldering", category: "Technique Bouldering", parameters: ["boulderingStyle"], possibleParameters: ["boulderingStyle"] },
        { id: "hangboard", name: "Hangboard", category: "Arms", parameters: ["hangboardTimes"] },
      ],
      templates: {
        Capacity: [
          { exercises: [{ id: "t1", type: "Hangboard", activeParameters: ["hangboardTimes"] }] },
        ],
      },
    };

    runDataMigrations(data);

    const freeBouldering = data.exerciseTypes.find((t: any) => t.id === "free-bouldering");
    expect(freeBouldering.parameters).toEqual(["climbingStyle"]);
    expect(freeBouldering.possibleParameters).toEqual(["climbingStyle"]);

    const hangboard = data.exerciseTypes.find((t: any) => t.id === "hangboard");
    expect(hangboard.parameters).toEqual(["timeOn"]);

    expect(data.workouts[0].exercises[0].activeParameters).toEqual(["climbingStyle", "duration"]);
    expect(data.templates["phase-capacity"][0].exercises[0].activeParameters).toEqual(["timeOn"]);
  });
});

describe("New: 3.13 -> 3.14 phase rename (final phaseId/WorkoutTemplate/TrainingBlock shape after the full Phase 3+4 chain)", () => {
  // runDataMigrations always walks to the current version in one pass, so
  // these assertions check the *final* shape (PhaseDef-resolved phaseId,
  // WorkoutTemplate[] keyed by phaseId, single-week TrainingBlocks instead
  // of PeriodizationWeek[]) rather than the intermediate name-keyed 3.14
  // shape - the 3.14 rename step still runs exactly as before, it's just no
  // longer the last word on phase representation.
  it("renames phase values and rekeys templates by phaseId when there is no colliding target key", () => {
    const data: any = {
      exportVersion: "3.13",
      workouts: [],
      exerciseTypes: [],
      periodization: [{ weekId: "2026-W01", phase: "Maintenance" }, { weekId: "2026-W02", phase: "Endurance" }],
      templates: {
        Maintenance: [{ id: "m1", exercises: [] }],
        Endurance: [{ id: "e1", exercises: [] }],
      },
    };

    runDataMigrations(data);

    expect(data.periodization).toBeUndefined();
    const phaseNameById = new Map(data.phaseDefs.map((p: any) => [p.id, p.name]));
    const blockByWeek = new Map(data.trainingBlocks.map((b: any) => [b.startWeekId, b]));
    expect((blockByWeek.get("2026-W01") as any).phase).toBeUndefined();
    expect(phaseNameById.get((blockByWeek.get("2026-W01") as any).phaseId)).toBe("Deload");
    expect(phaseNameById.get((blockByWeek.get("2026-W02") as any).phaseId)).toBe("Power Endurance");

    expect(data.templates.Maintenance).toBeUndefined();
    expect(data.templates.Endurance).toBeUndefined();
    expect(data.templates["phase-deload"]).toHaveLength(1);
    expect(data.templates["phase-deload"][0].exercises).toEqual([]);
    expect(data.templates["phase-power-endurance"]).toHaveLength(1);
    expect(data.templates["phase-power-endurance"][0].exercises).toEqual([]);
  });

  it("concatenates rather than overwrites when the target key already has templates", () => {
    const data: any = {
      exportVersion: "3.13",
      workouts: [],
      exerciseTypes: [],
      periodization: [],
      templates: {
        Deload: [{ id: "real-deload", exercises: [] }],
        Maintenance: [{ id: "legacy-maintenance", exercises: [] }],
      },
    };

    runDataMigrations(data);

    expect(data.templates.Maintenance).toBeUndefined();
    expect(data.templates["phase-deload"]).toHaveLength(2);
    data.templates["phase-deload"].forEach((t: any) => expect(t.exercises).toEqual([]));
  });
});

describe("Full-chain: minimal 1.0-shaped fixture to current version", () => {
  it("runs without throwing and produces a valid TrainingData shape", () => {
    const data: any = {
      workouts: [
        { id: 1, status: "planned", date: null, weekId: "2026-W01", loadFactor: 0, exercises: [] },
      ],
      periodization: [],
      exerciseTypes: [],
      templates: {},
    };

    expect(() => runDataMigrations(data)).not.toThrow();
    expect(data.exportVersion).toBe("3.24");
    expect(Array.isArray(data.workouts)).toBe(true);
    expect(data.periodization).toBeUndefined();
    expect(Array.isArray(data.trainingBlocks)).toBe(true);
    expect(Array.isArray(data.weekOverrides)).toBe(true);
    expect(Array.isArray(data.competitionEvents)).toBe(true);
    expect(Array.isArray(data.exerciseTypes)).toBe(true);
    expect(typeof data.templates).toBe("object");
    expect(Array.isArray(data.benchmarks)).toBe(true);
    expect(Array.isArray(data.benchmarkTypes)).toBe(true);
    expect(Array.isArray(data.analyticsCategories)).toBe(true);
    expect(Array.isArray(data.metricDefs)).toBe(true);
    expect(data.metricDefs.map((m: any) => m.id).sort()).toEqual(["hrv", "rhr", "sleep-score"]);
    expect(Array.isArray(data.dailyMetrics)).toBe(true);
    expect(Array.isArray(data.painLogs)).toBe(true);
    expect(data.dailyReadiness).toBeUndefined();
    expect(Array.isArray(data.phaseDefs)).toBe(true);
    expect(data.phaseDefs.map((p: any) => p.id).sort()).toEqual([
      "phase-capacity", "phase-deload", "phase-performance", "phase-power",
      "phase-power-endurance", "phase-strength", "phase-taper",
    ]);
  });
});

describe("No-op: data already at the current version", () => {
  it("leaves already-current data untouched", () => {
    const original = {
      exportVersion: "3.24",
      workouts: [
        { id: "w1", status: "completed", date: "2026-01-01", weekId: "2026-W01", loadFactor: 12, exercises: [] },
      ],
      trainingBlocks: [{ id: "b1", name: "Deload", phaseId: "phase-deload", startWeekId: "2026-W01", endWeekId: "2026-W01" }],
      weekOverrides: [],
      competitionEvents: [],
      exerciseTypes: [{ id: "free-bouldering", name: "Free Bouldering", category: "Technique Bouldering", parameters: ["climbingStyle"] }],
      templates: { "phase-deload": [] },
      phaseDefs: [{ id: "phase-deload", name: "Deload", color: "bg-zinc-500", order: 7 }],
      benchmarks: [],
      benchmarkTypes: [],
      analyticsCategories: [],
      metricDefs: [],
      dailyMetrics: [],
      painLogs: [],
    };
    const data = JSON.parse(JSON.stringify(original));

    runDataMigrations(data);

    expect(data).toEqual(original);
  });
});

describe("Round-trip: export -> import preserves counts and fields", () => {
  it("survives a JSON export/import cycle followed by migration", () => {
    const original: any = {
      exportVersion: "3.24",
      workouts: [
        {
          id: "w1",
          status: "completed",
          date: "2026-01-01",
          weekId: "2026-W01",
          loadFactor: 42,
          exercises: [{ id: "e1", typeId: "free-bouldering", prescribed: { duration: 90, notes: "good session" } }],
        },
        {
          id: "w2",
          status: "planned",
          date: null,
          weekId: "2026-W02",
          loadFactor: 0,
          exercises: [],
        },
      ],
      trainingBlocks: [{ id: "b1", name: "Capacity", phaseId: "phase-capacity", startWeekId: "2026-W01", endWeekId: "2026-W01" }],
      weekOverrides: [],
      competitionEvents: [],
      exerciseTypes: [{ id: "free-bouldering", name: "Free Bouldering", category: "Technique Bouldering", parameters: ["climbingStyle"] }],
      templates: { "phase-capacity": [] },
      phaseDefs: [{ id: "phase-capacity", name: "Capacity", color: "bg-success-hover", order: 1 }],
      benchmarks: [{ id: "b1", typeId: "t1", type: "Max Hang", notes: "", value: 20, unit: "kg", date: "2026-01-01", weekId: "2026-W01" }],
      benchmarkTypes: [{ id: "t1", name: "Max Hang", unit: "kg" }],
      analyticsCategories: [],
      metricDefs: [],
      dailyMetrics: [],
      painLogs: [],
    };

    // Simulate export (serialize) -> import (parse + migrate).
    const exported = JSON.stringify(original);
    const imported = JSON.parse(exported);
    runDataMigrations(imported);

    expect(imported.workouts).toHaveLength(2);
    expect(imported.workouts[0].exercises[0].prescribed.notes).toBe("good session");
    expect(imported.benchmarks).toHaveLength(1);
    expect(imported.benchmarks[0].value).toBe(20);
    expect(imported.exportVersion).toBe("3.24");
  });
});

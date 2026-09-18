import { describe, it, expect } from "vitest";
import type { AnalyticsCategory, ExerciseTypeDef, PhaseDef } from "../types";
import type { AIPlanOutput } from "./schema";
import {
  buildPlanPreview,
  buildPlanCommit,
  findExerciseTypeByName,
  findPhaseByName,
  findCategoryByName,
  normalizeName,
  resolveNewExerciseTypeCategory,
} from "./planImport";

const exerciseTypes: ExerciseTypeDef[] = [
  { id: "et-hangboard", name: "Hangboard", category: "cat-fingers", parameters: ["duration", "sets", "reps"] },
  { id: "et-boulder", name: "Free Bouldering", category: "cat-power", parameters: ["duration", "climbingStyle"] },
];

const phaseDefs: PhaseDef[] = [
  { id: "phase-capacity", name: "Capacity" },
  { id: "phase-deload", name: "Deload" },
];

const analyticsCategories: AnalyticsCategory[] = [
  { id: "cat-fingers", name: "Fingers", color: "red" },
  { id: "cat-power", name: "Power", color: "purple" },
];

function makePlan(overrides: Partial<AIPlanOutput> = {}): AIPlanOutput {
  return {
    weeks: [
      {
        weekId: "2026-W25",
        phaseName: "Capacity",
        workouts: [
          {
            name: "AM Session",
            exercises: [{ exerciseTypeName: "Hangboard", values: { duration: 30, sets: 5 } }],
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("findExerciseTypeByName / findPhaseByName", () => {
  it("matches case-insensitively", () => {
    expect(findExerciseTypeByName("hangboard", exerciseTypes)?.id).toBe("et-hangboard");
    expect(findExerciseTypeByName("  Hangboard  ", exerciseTypes)?.id).toBe("et-hangboard");
    expect(findPhaseByName("CAPACITY", phaseDefs)?.id).toBe("phase-capacity");
  });

  it("returns undefined for no match, does not fuzzy-match", () => {
    expect(findExerciseTypeByName("Hangboarding", exerciseTypes)).toBeUndefined();
    expect(findPhaseByName("Capacit", phaseDefs)).toBeUndefined();
  });
});

describe("findCategoryByName / resolveNewExerciseTypeCategory", () => {
  it("matches case-insensitively", () => {
    expect(findCategoryByName("fingers", analyticsCategories)?.id).toBe("cat-fingers");
    expect(findCategoryByName("  Power  ", analyticsCategories)?.id).toBe("cat-power");
  });

  it("resolves a matching categoryName to the category's NAME, not its id", () => {
    expect(resolveNewExerciseTypeCategory("Power", analyticsCategories)).toBe("Power");
  });

  it("falls back to the first non-archived category's name when categoryName doesn't match anything", () => {
    expect(resolveNewExerciseTypeCategory("Not A Real Category", analyticsCategories)).toBe("Fingers");
  });

  it("falls back to the first non-archived category's name when categoryName is omitted", () => {
    expect(resolveNewExerciseTypeCategory(undefined, analyticsCategories)).toBe("Fingers");
  });

  it("skips archived categories when falling back", () => {
    const withArchived: AnalyticsCategory[] = [
      { id: "cat-old", name: "Old", color: "gray", archived: true },
      { id: "cat-power", name: "Power", color: "purple" },
    ];
    expect(resolveNewExerciseTypeCategory(undefined, withArchived)).toBe("Power");
  });
});

describe("buildPlanPreview", () => {
  it("reports every referenced exercise type / phase name as resolved when it matches an existing entry", () => {
    const preview = buildPlanPreview(makePlan(), { exerciseTypes, phaseDefs });
    expect(preview.unresolvedExerciseTypeNames).toEqual([]);
    expect(preview.weeks[0].phaseResolved).toBe(true);
    expect(preview.totalWorkouts).toBe(1);
    expect(preview.totalExercises).toBe(1);
  });

  it("surfaces unresolved exercise type and phase names, deduped case-insensitively", () => {
    const plan = makePlan({
      weeks: [
        {
          weekId: "2026-W25",
          phaseName: "Power Endurance",
          workouts: [
            { exercises: [{ exerciseTypeName: "Campus Board", values: {} }] },
            { exercises: [{ exerciseTypeName: "campus board", values: {} }] },
          ],
        },
      ],
    });
    const preview = buildPlanPreview(plan, { exerciseTypes, phaseDefs });
    expect(preview.unresolvedExerciseTypeNames).toEqual(["Campus Board"]);
    expect(preview.unresolvedPhaseNames).toEqual(["Power Endurance"]);
    expect(preview.weeks[0].phaseResolved).toBe(false);
  });

  it("handles an empty plan", () => {
    const preview = buildPlanPreview({ weeks: [] }, { exerciseTypes, phaseDefs });
    expect(preview.weeks).toEqual([]);
    expect(preview.totalWorkouts).toBe(0);
    expect(preview.totalExercises).toBe(0);
  });
});

describe("buildPlanCommit", () => {
  it("resolves already-known names without creating anything new", () => {
    const result = buildPlanCommit(makePlan(), { exerciseTypes: {}, phases: {} }, { exerciseTypes, phaseDefs, analyticsCategories });
    expect(result.newExerciseTypes).toEqual([]);
    expect(result.newPhaseDefs).toEqual([]);
    expect(result.trainingBlocks).toHaveLength(1);
    expect(result.trainingBlocks[0]).toMatchObject({ phaseId: "phase-capacity", startWeekId: "2026-W25", endWeekId: "2026-W25" });
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]).toMatchObject({ status: "planned", weekId: "2026-W25", notes: "AM Session" });
    expect(result.workouts[0].exercises[0]).toMatchObject({ typeId: "et-hangboard", prescribed: { duration: 30, sets: 5 } });
    expect(result.workouts[0].blockId).toBe(result.trainingBlocks[0].id);
  });

  it("creates a new exercise type when the mapping says to, and every exercise slot referencing that name uses the same new id", () => {
    const plan = makePlan({
      weeks: [
        {
          weekId: "2026-W25",
          phaseName: "Capacity",
          workouts: [
            { exercises: [{ exerciseTypeName: "Campus Board", values: { sets: 3 } }] },
            { exercises: [{ exerciseTypeName: "Campus Board", values: { sets: 4 } }] },
          ],
        },
      ],
    });
    const result = buildPlanCommit(
      plan,
      { exerciseTypes: { [normalizeName("Campus Board")]: { action: "create" } }, phases: {} },
      { exerciseTypes, phaseDefs, analyticsCategories },
    );
    expect(result.newExerciseTypes).toHaveLength(1);
    expect(result.newExerciseTypes[0].name).toBe("Campus Board");
    expect(result.newExerciseTypes[0].category).toBe("Fingers");
    const newId = result.newExerciseTypes[0].id;
    expect(result.workouts[0].exercises[0].typeId).toBe(newId);
    expect(result.workouts[1].exercises[0].typeId).toBe(newId);
  });

  it("resolves a new exercise type's category from the AI-supplied categoryName, by name not id", () => {
    const plan = makePlan({
      weeks: [
        {
          weekId: "2026-W25",
          phaseName: "Capacity",
          workouts: [{ exercises: [{ exerciseTypeName: "Campus Board", categoryName: "Power", values: {} }] }],
        },
      ],
    });
    const result = buildPlanCommit(
      plan,
      { exerciseTypes: { [normalizeName("Campus Board")]: { action: "create" } }, phases: {} },
      { exerciseTypes, phaseDefs, analyticsCategories },
    );
    expect(result.newExerciseTypes[0].category).toBe("Power");
  });

  it("maps an unresolved name to an existing type/phase id when the mapping says to", () => {
    const plan = makePlan({
      weeks: [{ weekId: "2026-W25", phaseName: "Power Phase", workouts: [{ exercises: [{ exerciseTypeName: "Boulder", values: {} }] }] }],
    });
    const result = buildPlanCommit(
      plan,
      {
        exerciseTypes: { [normalizeName("Boulder")]: { action: "map", id: "et-boulder" } },
        phases: { [normalizeName("Power Phase")]: { action: "map", id: "phase-deload" } },
      },
      { exerciseTypes, phaseDefs, analyticsCategories },
    );
    expect(result.newExerciseTypes).toEqual([]);
    expect(result.newPhaseDefs).toEqual([]);
    expect(result.workouts[0].exercises[0].typeId).toBe("et-boulder");
    expect(result.trainingBlocks[0].phaseId).toBe("phase-deload");
  });

  it("groups contiguous weeks of the same resolved phase into a single TrainingBlock", () => {
    const plan = makePlan({
      weeks: [
        { weekId: "2026-W25", phaseName: "Capacity", workouts: [] },
        { weekId: "2026-W26", phaseName: "Capacity", workouts: [] },
        { weekId: "2026-W27", phaseName: "Deload", workouts: [] },
        { weekId: "2026-W28", phaseName: "Capacity", workouts: [] },
      ],
    });
    const result = buildPlanCommit(plan, { exerciseTypes: {}, phases: {} }, { exerciseTypes, phaseDefs, analyticsCategories });
    expect(result.trainingBlocks).toHaveLength(3);
    expect(result.trainingBlocks[0]).toMatchObject({ phaseId: "phase-capacity", startWeekId: "2026-W25", endWeekId: "2026-W26" });
    expect(result.trainingBlocks[1]).toMatchObject({ phaseId: "phase-deload", startWeekId: "2026-W27", endWeekId: "2026-W27" });
    expect(result.trainingBlocks[2]).toMatchObject({ phaseId: "phase-capacity", startWeekId: "2026-W28", endWeekId: "2026-W28" });
  });

  it("sorts out-of-order weeks before grouping into blocks", () => {
    const plan = makePlan({
      weeks: [
        { weekId: "2026-W27", phaseName: "Capacity", workouts: [] },
        { weekId: "2026-W25", phaseName: "Capacity", workouts: [] },
        { weekId: "2026-W26", phaseName: "Capacity", workouts: [] },
      ],
    });
    const result = buildPlanCommit(plan, { exerciseTypes: {}, phases: {} }, { exerciseTypes, phaseDefs, analyticsCategories });
    expect(result.trainingBlocks).toHaveLength(1);
    expect(result.trainingBlocks[0]).toMatchObject({ startWeekId: "2026-W25", endWeekId: "2026-W27" });
  });

  it("is deterministic - same input produces the same shape of output (ids differ, everything else identical)", () => {
    const a = buildPlanCommit(makePlan(), { exerciseTypes: {}, phases: {} }, { exerciseTypes, phaseDefs, analyticsCategories });
    const b = buildPlanCommit(makePlan(), { exerciseTypes: {}, phases: {} }, { exerciseTypes, phaseDefs, analyticsCategories });
    expect(a.workouts[0].notes).toBe(b.workouts[0].notes);
    expect(a.workouts[0].weekId).toBe(b.workouts[0].weekId);
    expect(a.trainingBlocks[0].phaseId).toBe(b.trainingBlocks[0].phaseId);
  });

  it("never mutates the ctx catalogs it's given", () => {
    const exerciseTypesCopy = JSON.parse(JSON.stringify(exerciseTypes));
    const phaseDefsCopy = JSON.parse(JSON.stringify(phaseDefs));
    buildPlanCommit(makePlan(), { exerciseTypes: {}, phases: {} }, { exerciseTypes, phaseDefs, analyticsCategories });
    expect(exerciseTypes).toEqual(exerciseTypesCopy);
    expect(phaseDefs).toEqual(phaseDefsCopy);
  });
});

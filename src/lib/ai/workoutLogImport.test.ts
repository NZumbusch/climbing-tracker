import { describe, it, expect } from "vitest";
import type { AnalyticsCategory, ExerciseTypeDef } from "../types";
import type { AIWorkoutLogOutput } from "./schema";
import { buildWorkoutLogPreview, buildWorkoutLogCommit } from "./workoutLogImport";
import { normalizeName } from "./planImport";

const exerciseTypes: ExerciseTypeDef[] = [
  { id: "et-hangboard", name: "Hangboard", category: "cat-fingers", parameters: ["duration", "sets"] },
];
const analyticsCategories: AnalyticsCategory[] = [{ id: "cat-fingers", name: "Fingers", color: "red" }];

function makeLog(overrides: Partial<AIWorkoutLogOutput> = {}): AIWorkoutLogOutput {
  return {
    workouts: [
      {
        date: "2026-09-16",
        name: "Evening session",
        exercises: [{ exerciseTypeName: "Hangboard", values: { duration: 30, sets: 5 } }],
      },
    ],
    ...overrides,
  };
}

describe("buildWorkoutLogPreview", () => {
  it("reports a resolved name as needing no mapping", () => {
    const preview = buildWorkoutLogPreview(makeLog(), exerciseTypes);
    expect(preview.unresolvedExerciseTypeNames).toEqual([]);
    expect(preview.totalExercises).toBe(1);
    expect(preview.workouts[0]).toMatchObject({ name: "Evening session", date: "2026-09-16", exerciseCount: 1 });
  });

  it("surfaces unresolved names deduped across multiple workouts", () => {
    const log = makeLog({
      workouts: [
        { exercises: [{ exerciseTypeName: "Campus Board", values: {} }] },
        { exercises: [{ exerciseTypeName: "campus board", values: {} }] },
      ],
    });
    const preview = buildWorkoutLogPreview(log, exerciseTypes);
    expect(preview.unresolvedExerciseTypeNames).toEqual(["Campus Board"]);
    expect(preview.totalExercises).toBe(2);
  });
});

describe("buildWorkoutLogCommit", () => {
  it("flattens every workout's exercises into one slot list, resolving known names", () => {
    const log = makeLog({
      workouts: [
        { exercises: [{ exerciseTypeName: "Hangboard", values: { duration: 20 } }] },
        { exercises: [{ exerciseTypeName: "Hangboard", values: { duration: 40 } }] },
      ],
    });
    const result = buildWorkoutLogCommit(log, { exerciseTypes: {} }, { exerciseTypes, analyticsCategories }, "logged");
    expect(result.newExerciseTypes).toEqual([]);
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0]).toMatchObject({ typeId: "et-hangboard", logged: { duration: 20 } });
    expect(result.slots[1]).toMatchObject({ typeId: "et-hangboard", logged: { duration: 40 } });
  });

  it("writes into the 'prescribed' bucket when asked", () => {
    const result = buildWorkoutLogCommit(makeLog(), { exerciseTypes: {} }, { exerciseTypes, analyticsCategories }, "prescribed");
    expect(result.slots[0].prescribed).toEqual({ duration: 30, sets: 5 });
    expect(result.slots[0].logged).toBeUndefined();
  });

  it("creates a new exercise type for an unresolved name mapped to 'create', reused across occurrences", () => {
    const log = makeLog({
      workouts: [
        { exercises: [{ exerciseTypeName: "Campus Board", values: {} }, { exerciseTypeName: "Campus Board", values: {} }] },
      ],
    });
    const result = buildWorkoutLogCommit(
      log,
      { exerciseTypes: { [normalizeName("Campus Board")]: { action: "create" } } },
      { exerciseTypes, analyticsCategories },
      "logged",
    );
    expect(result.newExerciseTypes).toHaveLength(1);
    expect(result.slots[0].typeId).toBe(result.newExerciseTypes[0].id);
    expect(result.slots[1].typeId).toBe(result.newExerciseTypes[0].id);
  });

  it("maps an unresolved name to an existing type id when asked", () => {
    const log = makeLog({ workouts: [{ exercises: [{ exerciseTypeName: "Fingerboard", values: {} }] }] });
    const result = buildWorkoutLogCommit(
      log,
      { exerciseTypes: { [normalizeName("Fingerboard")]: { action: "map", id: "et-hangboard" } } },
      { exerciseTypes, analyticsCategories },
      "logged",
    );
    expect(result.newExerciseTypes).toEqual([]);
    expect(result.slots[0].typeId).toBe("et-hangboard");
  });

  it("handles an empty log", () => {
    const result = buildWorkoutLogCommit({ workouts: [] }, { exerciseTypes: {} }, { exerciseTypes, analyticsCategories }, "logged");
    expect(result.slots).toEqual([]);
    expect(result.newExerciseTypes).toEqual([]);
  });
});

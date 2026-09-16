import type { AnalyticsCategory, ExerciseSlot, ExerciseTypeDef } from "../types";
import { generateId } from "../utils";
import type { AIWorkoutLogOutput } from "./schema";
import { buildExerciseSlot, findExerciseTypeByName, normalizeName, type NameMapping } from "./planImport";

/**
 * The "paste free-text training notes, get structured exercises" flow
 * (PLAN.md Phase 5) reuses `AIExercise`/name-resolution from the plan
 * importer, but its target is a single in-progress workout's exercise list
 * (`WorkoutForm.svelte`), not the whole plan/calendar - so unlike
 * `planImport.ts` there's no `TrainingBlock`/`Workout` to build here. Every
 * exercise from every parsed "workout" is flattened into one slot list,
 * since the consuming form only ever edits one workout at a time (see
 * PLAN.md's own framing: "targeting a single workout's exercises instead of
 * a whole plan").
 */

export interface WorkoutLogPreviewWorkout {
  name?: string;
  date?: string;
  exerciseCount: number;
}

export interface WorkoutLogPreview {
  workouts: WorkoutLogPreviewWorkout[];
  unresolvedExerciseTypeNames: string[];
  totalExercises: number;
}

export function buildWorkoutLogPreview(
  log: AIWorkoutLogOutput,
  exerciseTypes: ExerciseTypeDef[],
): WorkoutLogPreview {
  const names: string[] = [];
  const workouts = log.workouts.map((w) => {
    for (const e of w.exercises) names.push(e.exerciseTypeName);
    return { name: w.name, date: w.date, exerciseCount: w.exercises.length };
  });
  const seen = new Set<string>();
  const unresolvedExerciseTypeNames: string[] = [];
  for (const name of names) {
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    if (!findExerciseTypeByName(name, exerciseTypes)) unresolvedExerciseTypeNames.push(name);
  }
  return { workouts, unresolvedExerciseTypeNames, totalExercises: names.length };
}

export interface WorkoutLogCommitResult {
  newExerciseTypes: ExerciseTypeDef[];
  slots: ExerciseSlot[];
}

/**
 * Pure commit builder, mirroring `buildPlanCommit`'s resolution rules
 * exactly (case-insensitive exact-name match, "create" mapping makes a
 * fresh `ExerciseTypeDef`). `bucket` selects which `ExerciseSlot` field the
 * parsed values land in - "prescribed" while planning, "logged" once a
 * session is actually being logged (mirrors `WorkoutForm.svelte`'s existing
 * `exerciseFormMode`).
 */
export function buildWorkoutLogCommit(
  log: AIWorkoutLogOutput,
  mapping: { exerciseTypes: Record<string, NameMapping> },
  ctx: { exerciseTypes: ExerciseTypeDef[]; analyticsCategories: AnalyticsCategory[] },
  bucket: "prescribed" | "logged",
): WorkoutLogCommitResult {
  const newExerciseTypes: ExerciseTypeDef[] = [];
  const typeIdByName = new Map<string, string>();

  const resolveTypeId = (name: string): string => {
    const key = normalizeName(name);
    const cached = typeIdByName.get(key);
    if (cached) return cached;
    const existing = findExerciseTypeByName(name, ctx.exerciseTypes);
    if (existing) {
      typeIdByName.set(key, existing.id);
      return existing.id;
    }
    const choice = mapping.exerciseTypes[key];
    if (choice?.action === "map") {
      typeIdByName.set(key, choice.id);
      return choice.id;
    }
    const fallbackCategory = ctx.analyticsCategories.find((c) => !c.archived) ?? ctx.analyticsCategories[0];
    const created: ExerciseTypeDef = {
      id: generateId(),
      name,
      category: fallbackCategory?.id ?? "",
      parameters: [],
    };
    newExerciseTypes.push(created);
    typeIdByName.set(key, created.id);
    return created.id;
  };

  const slots: ExerciseSlot[] = [];
  for (const w of log.workouts) {
    for (const e of w.exercises) {
      resolveTypeId(e.exerciseTypeName);
    }
  }
  const exerciseTypeById = new Map<string, ExerciseTypeDef>([
    ...ctx.exerciseTypes.map((t): [string, ExerciseTypeDef] => [t.id, t]),
    ...newExerciseTypes.map((t): [string, ExerciseTypeDef] => [t.id, t]),
  ]);
  for (const w of log.workouts) {
    for (const e of w.exercises) {
      slots.push(buildExerciseSlot(e, resolveTypeId(e.exerciseTypeName), exerciseTypeById, bucket));
    }
  }

  return { newExerciseTypes, slots };
}

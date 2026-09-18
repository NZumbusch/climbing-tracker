import type {
  AnalyticsCategory,
  ExerciseSlot,
  ExerciseTypeDef,
  PhaseDef,
  TrainingBlock,
  Workout,
} from "../types";
import { calculatePlannedLoad } from "../types";
import { generateId } from "../utils";
import { incrementWeekId } from "../dateUtils";
import type { AIExercise, AIPlanOutput } from "./schema";

/**
 * How the user resolves one AI-supplied name (an exercise type name or a
 * phase name) that doesn't exactly match an existing catalog entry - either
 * pointing it at an existing entry, or creating a new one. PLAN.md is
 * explicit that an unresolved name must never be silently invented without
 * the user seeing it happen - this type is what the import UI collects to
 * make that choice explicit before anything commits.
 */
export type NameMapping = { action: "map"; id: string } | { action: "create" };

/**
 * Case-insensitive key used both to dedupe unresolved-name lists and to key
 * `NameMapping` records - callers (AIImportModal, tests) must key their
 * mapping objects by `normalizeName(name)`, never by the raw display string,
 * so a name that appears with different casing in different parts of the
 * same pasted plan still resolves to one mapping choice.
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Case-insensitive exact-name match only - no fuzzy matching, to avoid surprising auto-links. */
export function findExerciseTypeByName(name: string, exerciseTypes: ExerciseTypeDef[]): ExerciseTypeDef | undefined {
  const target = normalizeName(name);
  return exerciseTypes.find((t) => normalizeName(t.name) === target);
}

export function findPhaseByName(name: string, phaseDefs: PhaseDef[]): PhaseDef | undefined {
  const target = normalizeName(name);
  return phaseDefs.find((p) => normalizeName(p.name) === target);
}

export function findCategoryByName(name: string, categories: AnalyticsCategory[]): AnalyticsCategory | undefined {
  const target = normalizeName(name);
  return categories.find((c) => normalizeName(c.name) === target);
}

/**
 * Resolves what to write into a freshly-created `ExerciseTypeDef.category`
 * for an AI import (Stage 10, UI_PLAN.md §5.8). `ExerciseTypeDef.category`
 * stores the category's **name**, not its id - confirmed by every other
 * writer (`ExerciseTypeSettings.svelte`'s `<option value={cat.name}>`,
 * `Analytics.svelte`'s `typeToCategory` map keyed straight off `t.category`
 * for chart bucketing). Before this stage both this function's call sites
 * wrote `fallbackCategory?.id` instead - a pre-existing bug (a freshly
 * AI-created exercise type displayed a raw id like "cat-1" as its category)
 * that happened to go unnoticed because nothing exercised the "AI invents a
 * new exercise type" path with real category display. Fixed here, in the
 * same edit that gives the AI a way to *choose* the category via
 * `categoryName` - flagged in `PROGRESS.md` since it's an incidental fix
 * bundled with the new feature, not itself the feature.
 */
export function resolveNewExerciseTypeCategory(
  categoryName: string | undefined,
  categories: AnalyticsCategory[],
): string {
  if (categoryName) {
    const matched = findCategoryByName(categoryName, categories);
    if (matched) return matched.name;
  }
  const fallback = categories.find((c) => !c.archived) ?? categories[0];
  return fallback?.name ?? "";
}

function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = normalizeName(name);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(name);
    }
  }
  return result;
}

export interface PlanPreviewWeek {
  weekId: string;
  phaseName: string;
  phaseResolved: boolean;
  workoutCount: number;
  exerciseCount: number;
}

export interface PlanPreview {
  weeks: PlanPreviewWeek[];
  /** Deduped (case-insensitive), in first-seen order. */
  unresolvedExerciseTypeNames: string[];
  unresolvedPhaseNames: string[];
  totalWorkouts: number;
  totalExercises: number;
}

/**
 * Pure preview builder: what importing `plan` would do against the
 * *current* catalog, and which names still need the user to map or create.
 * Never mutates anything, never calls storage - the component calls this on
 * every keystroke/paste to render the diff before any commit is possible.
 */
export function buildPlanPreview(
  plan: AIPlanOutput,
  ctx: { exerciseTypes: ExerciseTypeDef[]; phaseDefs: PhaseDef[] },
): PlanPreview {
  const exerciseNames: string[] = [];
  const phaseNames: string[] = [];
  let totalWorkouts = 0;
  let totalExercises = 0;

  const weeks: PlanPreviewWeek[] = plan.weeks.map((week) => {
    phaseNames.push(week.phaseName);
    const phaseResolved = !!findPhaseByName(week.phaseName, ctx.phaseDefs);
    let exerciseCount = 0;
    for (const workout of week.workouts) {
      for (const exercise of workout.exercises) {
        exerciseNames.push(exercise.exerciseTypeName);
        exerciseCount++;
      }
    }
    totalWorkouts += week.workouts.length;
    totalExercises += exerciseCount;
    return {
      weekId: week.weekId,
      phaseName: week.phaseName,
      phaseResolved,
      workoutCount: week.workouts.length,
      exerciseCount,
    };
  });

  const unresolvedExerciseTypeNames = uniqueNames(
    exerciseNames.filter((name) => !findExerciseTypeByName(name, ctx.exerciseTypes)),
  );
  const unresolvedPhaseNames = uniqueNames(
    phaseNames.filter((name) => !findPhaseByName(name, ctx.phaseDefs)),
  );

  return { weeks, unresolvedExerciseTypeNames, unresolvedPhaseNames, totalWorkouts, totalExercises };
}

export interface PlanCommitResult {
  newExerciseTypes: ExerciseTypeDef[];
  newPhaseDefs: PhaseDef[];
  trainingBlocks: TrainingBlock[];
  workouts: Workout[];
}

/** Shared with `workoutLogImport.ts` - building an `ExerciseSlot` from a validated AI exercise is identical either way. */
export function buildExerciseSlot(
  exercise: AIExercise,
  typeId: string,
  exerciseTypeById: Map<string, ExerciseTypeDef>,
  bucket: "prescribed" | "logged" = "prescribed",
): ExerciseSlot {
  const type = exerciseTypeById.get(typeId);
  return {
    id: generateId(),
    typeId,
    // Seed the type's own default parameters, same as a freshly-added
    // exercise in ExerciseForm.svelte would get - not just whatever fields
    // happened to be present in `values`, so the exercise renders normally
    // in the edit form afterward.
    activeParameters: type ? [...type.parameters] : undefined,
    [bucket]: exercise.values,
  };
}

/**
 * Pure commit builder: given a validated plan and the user's resolution for
 * every previously-unresolved name, produces exactly what will be written -
 * new catalog entries (if any names were mapped to "create new"), the
 * `TrainingBlock`s covering the plan's weeks (grouped into contiguous
 * same-phase runs, since PLAN.md's `TrainingBlock` is a possibly-multi-week
 * concurrent emphasis, not one row per week), and the new planned
 * `Workout`s. The caller (AIImportModal) is responsible for actually
 * persisting this via the normal `planningStore`/`workoutStore` services -
 * this function never touches storage, so it's fully unit-testable and
 * fully deterministic for a given mapping.
 *
 * Assumes every name referenced by `plan` has an entry in `exerciseTypeMapping`/
 * `phaseMapping` - the caller must not offer to commit until that's true
 * (see `buildPlanPreview`'s unresolved-name lists).
 */
export function buildPlanCommit(
  plan: AIPlanOutput,
  /** Both records keyed by `normalizeName(name)`, not the raw display string. */
  mapping: { exerciseTypes: Record<string, NameMapping>; phases: Record<string, NameMapping> },
  ctx: { exerciseTypes: ExerciseTypeDef[]; phaseDefs: PhaseDef[]; analyticsCategories: AnalyticsCategory[] },
): PlanCommitResult {
  const newExerciseTypes: ExerciseTypeDef[] = [];
  const newPhaseDefs: PhaseDef[] = [];

  // Resolve every exercise-type name to a concrete id up front, creating a
  // fresh ExerciseTypeDef (with a fresh id) for every "create" mapping.
  // Takes the whole `AIExercise` (not just the name) so a "create" can read
  // its optional `categoryName` - only the first occurrence of a given name
  // within this import is consulted, since resolution is cached by name.
  const exerciseTypeIdByName = new Map<string, string>();
  const resolveExerciseTypeId = (exercise: AIExercise): string => {
    const name = exercise.exerciseTypeName;
    const key = normalizeName(name);
    const cached = exerciseTypeIdByName.get(key);
    if (cached) return cached;
    const existing = findExerciseTypeByName(name, ctx.exerciseTypes);
    if (existing) {
      exerciseTypeIdByName.set(key, existing.id);
      return existing.id;
    }
    const choice = mapping.exerciseTypes[key];
    if (choice?.action === "map") {
      exerciseTypeIdByName.set(key, choice.id);
      return choice.id;
    }
    // "create" (or no mapping recorded, e.g. a duplicate of an
    // already-created name within this same import) - resolve its category
    // from the AI-supplied `categoryName` where possible (see
    // `resolveNewExerciseTypeCategory`'s doc comment), falling back to a
    // generic default so it always resolves.
    const created: ExerciseTypeDef = {
      id: generateId(),
      name,
      category: resolveNewExerciseTypeCategory(exercise.categoryName, ctx.analyticsCategories),
      parameters: [],
    };
    newExerciseTypes.push(created);
    exerciseTypeIdByName.set(key, created.id);
    return created.id;
  };

  const phaseIdByName = new Map<string, string>();
  const resolvePhaseId = (name: string): string => {
    const key = normalizeName(name);
    const cached = phaseIdByName.get(key);
    if (cached) return cached;
    const existing = findPhaseByName(name, ctx.phaseDefs);
    if (existing) {
      phaseIdByName.set(key, existing.id);
      return existing.id;
    }
    const choice = mapping.phases[key];
    if (choice?.action === "map") {
      phaseIdByName.set(key, choice.id);
      return choice.id;
    }
    const created: PhaseDef = { id: generateId(), name };
    newPhaseDefs.push(created);
    phaseIdByName.set(key, created.id);
    return created.id;
  };

  // Resolve every exercise type name referenced anywhere in the plan before
  // building workouts, so `exerciseTypeById` below is complete.
  for (const week of plan.weeks) {
    for (const workout of week.workouts) {
      for (const exercise of workout.exercises) {
        resolveExerciseTypeId(exercise);
      }
    }
  }
  const exerciseTypeById = new Map<string, ExerciseTypeDef>([
    ...ctx.exerciseTypes.map((t): [string, ExerciseTypeDef] => [t.id, t]),
    ...newExerciseTypes.map((t): [string, ExerciseTypeDef] => [t.id, t]),
  ]);

  // Sort weeks chronologically (weekId strings sort correctly, see
  // trainingBlocks.ts) and group contiguous runs of the same resolved
  // phaseId into a single TrainingBlock each.
  const weeksWithPhaseId = [...plan.weeks]
    .map((week) => ({ week, phaseId: resolvePhaseId(week.phaseName) }))
    .sort((a, b) => (a.week.weekId < b.week.weekId ? -1 : a.week.weekId > b.week.weekId ? 1 : 0));

  const trainingBlocks: TrainingBlock[] = [];
  const blockIdByWeekId = new Map<string, string>();
  for (const { week, phaseId } of weeksWithPhaseId) {
    const last = trainingBlocks[trainingBlocks.length - 1];
    const isContiguous = last && last.phaseId === phaseId && incrementWeekId(last.endWeekId) === week.weekId;
    if (isContiguous) {
      last.endWeekId = week.weekId;
    } else {
      const phase = ctx.phaseDefs.find((p) => p.id === phaseId) ?? newPhaseDefs.find((p) => p.id === phaseId);
      trainingBlocks.push({
        id: generateId(),
        name: phase?.name ?? "AI Import",
        phaseId,
        startWeekId: week.weekId,
        endWeekId: week.weekId,
      });
    }
    blockIdByWeekId.set(week.weekId, trainingBlocks[trainingBlocks.length - 1].id);
  }

  const workouts: Workout[] = [];
  for (const { week } of weeksWithPhaseId) {
    for (const w of week.workouts) {
      const exercises = w.exercises.map((e) =>
        buildExerciseSlot(e, resolveExerciseTypeId(e), exerciseTypeById),
      );
      workouts.push({
        id: generateId(),
        status: "planned",
        date: null,
        dayOfWeek: w.dayOfWeek,
        weekId: week.weekId,
        notes: w.name || "",
        loadFactor: 0,
        plannedLoad: exercises.reduce((acc, e) => acc + calculatePlannedLoad(e.prescribed ?? {}), 0),
        exercises,
        blockId: blockIdByWeekId.get(week.weekId),
      });
    }
  }

  return { newExerciseTypes, newPhaseDefs, trainingBlocks, workouts };
}

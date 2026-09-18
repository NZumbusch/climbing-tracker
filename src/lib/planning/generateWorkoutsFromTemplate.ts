import type { Workout, WorkoutTemplate } from "../types";
import { calculatePlannedLoad } from "../types";
import { generateId } from "../utils";

/**
 * Builds the set of planned workouts that assigning a phase to a week
 * generates from that phase's templates. Pure and synchronous - storage
 * only persists the result, it doesn't decide what a phase assignment
 * implies (see PLAN.md Phase 2).
 *
 * Regenerates every exercise slot's id (not just reusing the template's):
 * assigning the same phase to multiple weeks would otherwise give every
 * generated workout's exercises the same ids as the template (and as each
 * other) - the same id-collision bug class the plan calls out for
 * duplicateWorkout, hit here too since this is another place exercises are
 * copied rather than created fresh.
 */
export function generateWorkoutsFromTemplate(
  weekId: string,
  templates: WorkoutTemplate[],
): Workout[] {
  return templates.map((t) => ({
    id: generateId(),
    status: "planned",
    date: null,
    dayOfWeek: t.dayOfWeek,
    weekId,
    notes: t.name || "",
    loadFactor: 0,
    plannedLoad: t.exercises?.reduce((acc, e) => acc + calculatePlannedLoad(e.prescribed ?? {}), 0) || 0,
    exercises: (t.exercises || []).map((e) => ({ ...e, id: generateId() })),
  })) as Workout[];
}

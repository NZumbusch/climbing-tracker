import type { ExerciseSlot, ExerciseTypeDef, ExerciseValues } from './types';

/**
 * The effective values to read for a slot: what happened if it was logged,
 * otherwise the plan. Used by every read-only display (history, analytics,
 * CSV/PDF export, share cards) - none of them need to distinguish plan vs
 * actual themselves, they just want "the best information available."
 */
export function slotValues(slot: ExerciseSlot): ExerciseValues {
  return slot.logged ?? slot.prescribed ?? {};
}

/**
 * Resolves a slot's exercise type display name via `typeId`, including
 * types that have since been archived (they stay in the list, never
 * hard-deleted, once referenced - see PLAN.md principle 2).
 */
export function slotTypeName(slot: ExerciseSlot, exerciseTypes: ExerciseTypeDef[]): string {
  return exerciseTypes.find(t => t.id === slot.typeId)?.name ?? 'Unknown';
}

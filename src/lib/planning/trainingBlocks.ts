import type { TrainingBlock } from "../types";

/**
 * All blocks whose [startWeekId, endWeekId] range covers `weekId`. Plain
 * string comparison is safe here: week ids are always "YYYY-Wnn" (zero-
 * padded), which sorts lexicographically in chronological order, including
 * across year boundaries (e.g. "2025-W52" < "2026-W01").
 */
export function getBlocksForWeek(blocks: TrainingBlock[], weekId: string): TrainingBlock[] {
  return blocks.filter((b) => b.startWeekId <= weekId && weekId <= b.endWeekId);
}

/**
 * The block that "wins" for a week covered by more than one (PLAN.md Phase
 * 4: `priority` "for overlapping blocks, which dominates template
 * selection/display"). Higher `priority` wins (default 0); ties are broken
 * by whichever block appears later in the array (last-created wins) - an
 * arbitrary but deterministic tiebreak, since the plan doesn't specify one.
 */
export function getDominantBlockForWeek(blocks: TrainingBlock[], weekId: string): TrainingBlock | undefined {
  const covering = getBlocksForWeek(blocks, weekId);
  if (covering.length === 0) return undefined;
  return covering.reduce((best, b) => ((b.priority ?? 0) >= (best.priority ?? 0) ? b : best));
}

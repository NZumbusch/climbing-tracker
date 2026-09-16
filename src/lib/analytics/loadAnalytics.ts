import type { Workout, DailyMetricEntry, PainLog } from "../types";
import { calculatePlannedLoad } from "../types";
import { getWeekId } from "../dateUtils";

/**
 * Pure, independently-testable load-management analytics (PLAN.md Phase 4).
 * Operates on week-buckets (`Workout.weekId`/`loadFactor`) rather than a
 * continuous rolling daily window - the app's data model is already
 * week-oriented (periodization, templates, the existing Analytics.svelte
 * charts), and workouts don't reliably carry a `date` until completed, so a
 * week-bucketed "ACWR-style" calculation is the honest fit for this
 * codebase's data rather than a literal 7-day/28-day rolling window over
 * daily totals.
 */

// A commonly cited sports-science rule of thumb (the ACWR framework
// popularized by Gabbett 2016): a >10% week-over-week jump in training load
// is associated with elevated soft-tissue injury risk. Not a constant this
// codebase derived itself - a tunable default, see PLAN.md Phase 4.
export const RAMP_RATE_SPIKE_THRESHOLD = 0.1;

// Another commonly cited ACWR rule of thumb: a ratio above ~1.5 (acute load
// well above the chronic baseline) is considered a "high risk" zone. Also a
// tunable default, not a fixed constant from this codebase.
export const ACWR_HIGH_RISK_RATIO = 1.5;

// 6+ consecutive days of training with no rest day is a simple, commonly
// used heuristic for overtraining/recovery risk. Tunable default.
export const CONSECUTIVE_TRAINING_DAY_THRESHOLD = 6;

/** Total `loadFactor` of completed workouts in a given week. */
export function calculateWeeklyLoad(workouts: Workout[], weekId: string): number {
  return workouts
    .filter((w) => w.status === "completed" && w.weekId === weekId)
    .reduce((sum, w) => sum + (w.loadFactor || 0), 0);
}

export interface AcwrResult {
  weekId: string;
  /** This week's total completed load - the "acute" window. */
  acuteLoad: number;
  /** Average completed load over this week and up to the previous 3 (the "chronic" baseline, a 4-week/28-day window). */
  chronicLoad: number;
  /** acuteLoad / chronicLoad, 0 if chronicLoad is 0 (no baseline to compare against). */
  ratio: number;
  /** Week-over-week % change in acute load vs the previous week, 0 if there's no previous week or it had no load. */
  rampRate: number;
  /** rampRate exceeds RAMP_RATE_SPIKE_THRESHOLD. */
  spike: boolean;
}

/**
 * Computes ACWR-style acute:chronic load ratios and week-over-week
 * ramp-rate for every week in `orderedWeekIds` (must be in chronological
 * order - the chronic window and ramp-rate both look backward from each
 * entry's position in this array, not by parsing the week id itself).
 */
export function calculateAcwrForWeeks(workouts: Workout[], orderedWeekIds: string[]): AcwrResult[] {
  return orderedWeekIds.map((weekId, i) => {
    const acuteLoad = calculateWeeklyLoad(workouts, weekId);

    const chronicWindow = orderedWeekIds.slice(Math.max(0, i - 3), i + 1);
    const chronicLoad =
      chronicWindow.reduce((sum, w) => sum + calculateWeeklyLoad(workouts, w), 0) / chronicWindow.length;

    const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : 0;

    const prevWeekId = i > 0 ? orderedWeekIds[i - 1] : undefined;
    const prevLoad = prevWeekId !== undefined ? calculateWeeklyLoad(workouts, prevWeekId) : undefined;
    const rampRate = prevLoad ? (acuteLoad - prevLoad) / prevLoad : 0;

    return {
      weekId,
      acuteLoad,
      chronicLoad,
      ratio,
      rampRate,
      spike: rampRate > RAMP_RATE_SPIKE_THRESHOLD,
    };
  });
}

export interface AdherenceResult {
  workoutId: string;
  weekId: string;
  totalSlots: number;
  loggedSlots: number;
  /** loggedSlots / totalSlots, 0 if there are no slots. */
  completionRate: number;
  plannedLoad: number;
  actualLoad: number;
  /** actualLoad - plannedLoad. */
  loadVariance: number;
}

/** Diffs a single workout's `prescribed` vs `logged` exercise slots. */
export function calculateWorkoutAdherence(workout: Workout): AdherenceResult {
  const totalSlots = workout.exercises.length;
  const loggedSlots = workout.exercises.filter((e) => e.logged !== undefined).length;
  const plannedLoad = workout.exercises.reduce((sum, e) => sum + calculatePlannedLoad(e.prescribed ?? {}), 0);
  const actualLoad = workout.exercises.reduce(
    (sum, e) => sum + calculatePlannedLoad(e.logged ?? e.prescribed ?? {}),
    0,
  );

  return {
    workoutId: workout.id,
    weekId: workout.weekId,
    totalSlots,
    loggedSlots,
    completionRate: totalSlots > 0 ? loggedSlots / totalSlots : 0,
    plannedLoad,
    actualLoad,
    loadVariance: actualLoad - plannedLoad,
  };
}

export interface WeeklyAdherence {
  weekId: string;
  completionRate: number;
  plannedLoad: number;
  actualLoad: number;
  loadVariance: number;
}

/** Aggregates `calculateWorkoutAdherence` across every completed workout in a week. */
export function calculateWeeklyAdherence(workouts: Workout[], weekId: string): WeeklyAdherence {
  const results = workouts
    .filter((w) => w.weekId === weekId && w.status === "completed")
    .map(calculateWorkoutAdherence);

  const totalSlots = results.reduce((sum, r) => sum + r.totalSlots, 0);
  const loggedSlots = results.reduce((sum, r) => sum + r.loggedSlots, 0);
  const plannedLoad = results.reduce((sum, r) => sum + r.plannedLoad, 0);
  const actualLoad = results.reduce((sum, r) => sum + r.actualLoad, 0);

  return {
    weekId,
    completionRate: totalSlots > 0 ? loggedSlots / totalSlots : 0,
    plannedLoad,
    actualLoad,
    loadVariance: actualLoad - plannedLoad,
  };
}

export interface RecoveryWarning {
  /** The week id (readiness-decline warnings) or the last date of the streak (consecutive-day warnings) this warning is anchored to. */
  date: string;
  reason: string;
}

function isNextCalendarDay(a: string, b: string): boolean {
  return new Date(b).getTime() - new Date(a).getTime() === 24 * 60 * 60 * 1000;
}

/** Flags runs of `thresholdDays`-or-more consecutive completed-workout calendar days with no rest day. */
export function findConsecutiveTrainingDayWarnings(
  workouts: Workout[],
  thresholdDays = CONSECUTIVE_TRAINING_DAY_THRESHOLD,
): RecoveryWarning[] {
  const dates = Array.from(
    new Set(
      workouts
        .filter((w) => w.status === "completed" && w.date)
        .map((w) => w.date!.split("T")[0]),
    ),
  ).sort();

  const warnings: RecoveryWarning[] = [];
  let streakStart = 0;
  for (let i = 1; i <= dates.length; i++) {
    const continuesStreak = i < dates.length && isNextCalendarDay(dates[i - 1], dates[i]);
    if (!continuesStreak) {
      const streakLength = i - streakStart;
      if (streakLength >= thresholdDays) {
        warnings.push({
          date: dates[i - 1],
          reason: `${streakLength} consecutive training days without a rest day`,
        });
      }
      streakStart = i;
    }
  }
  return warnings;
}

function averageMetricByWeek(entries: DailyMetricEntry[], metricId: string): Map<string, number> {
  const valuesByWeek = new Map<string, number[]>();
  entries
    .filter((e) => e.metricId === metricId)
    .forEach((e) => {
      const weekId = getWeekId(new Date(e.date));
      if (!valuesByWeek.has(weekId)) valuesByWeek.set(weekId, []);
      valuesByWeek.get(weekId)!.push(e.value);
    });

  const averages = new Map<string, number>();
  valuesByWeek.forEach((values, weekId) => {
    averages.set(weekId, values.reduce((a, b) => a + b, 0) / values.length);
  });
  return averages;
}

/**
 * Flags weeks where load spiked (per `calculateAcwrForWeeks`) while
 * readiness (sleep score / HRV down, or resting HR up, week-over-week)
 * declined - a combination commonly used as a signal that recovery is
 * being skipped - plus any run of consecutive training days with no rest.
 */
export function findRecoveryWarnings(
  workouts: Workout[],
  dailyMetrics: DailyMetricEntry[],
  orderedWeekIds: string[],
): RecoveryWarning[] {
  const warnings = findConsecutiveTrainingDayWarnings(workouts);

  const acwr = calculateAcwrForWeeks(workouts, orderedWeekIds);
  const sleepByWeek = averageMetricByWeek(dailyMetrics, "sleep-score");
  const hrvByWeek = averageMetricByWeek(dailyMetrics, "hrv");
  const rhrByWeek = averageMetricByWeek(dailyMetrics, "rhr");

  acwr.forEach((week, i) => {
    if (!week.spike || i === 0) return;
    const prevWeekId = orderedWeekIds[i - 1];

    const sleepNow = sleepByWeek.get(week.weekId);
    const sleepPrev = sleepByWeek.get(prevWeekId);
    const hrvNow = hrvByWeek.get(week.weekId);
    const hrvPrev = hrvByWeek.get(prevWeekId);
    const rhrNow = rhrByWeek.get(week.weekId);
    const rhrPrev = rhrByWeek.get(prevWeekId);

    const sleepDeclined = sleepNow !== undefined && sleepPrev !== undefined && sleepNow < sleepPrev;
    const hrvDeclined = hrvNow !== undefined && hrvPrev !== undefined && hrvNow < hrvPrev;
    const rhrRose = rhrNow !== undefined && rhrPrev !== undefined && rhrNow > rhrPrev;

    if (sleepDeclined || hrvDeclined || rhrRose) {
      const signals = [
        sleepDeclined && "sleep score down",
        hrvDeclined && "HRV down",
        rhrRose && "resting HR up",
      ].filter(Boolean);
      warnings.push({
        date: week.weekId,
        reason: `Load spiked ${Math.round(week.rampRate * 100)}% week-over-week while readiness declined (${signals.join(", ")})`,
      });
    }
  });

  return warnings;
}

export interface PainLoadCorrelation {
  painLogId: string;
  date: string;
  weekId: string;
  severity: number;
  bodyPart: string;
  /** True if this log's week (or the week before it) had a load spike or a high-risk ACWR ratio. */
  loadSpikeNearby: boolean;
}

/** Correlates logged pain/discomfort entries against nearby ACWR load spikes. */
export function correlatePainWithLoadSpikes(
  painLogs: PainLog[],
  acwr: AcwrResult[],
): PainLoadCorrelation[] {
  const indexByWeek = new Map(acwr.map((a, i) => [a.weekId, i]));

  return painLogs.map((log) => {
    const i = indexByWeek.get(log.weekId);
    const week = i !== undefined ? acwr[i] : undefined;
    const prevWeek = i !== undefined && i > 0 ? acwr[i - 1] : undefined;

    const loadSpikeNearby = !!(
      week?.spike ||
      prevWeek?.spike ||
      (week && week.ratio > ACWR_HIGH_RISK_RATIO)
    );

    return {
      painLogId: log.id,
      date: log.date,
      weekId: log.weekId,
      severity: log.severity,
      bodyPart: log.bodyPart,
      loadSpikeNearby,
    };
  });
}

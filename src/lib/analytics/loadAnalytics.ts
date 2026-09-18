import type { Workout, DailyMetricEntry, PainLog } from "../types";
import { calculatePlannedLoad } from "../types";
import { getWeekId, getWeekDates, toUtcDayIndex } from "../dateUtils";

/**
 * Pure, independently-testable load-management analytics (PLAN.md Phase 4).
 * Most of this module still operates on week-buckets (`Workout.weekId`/
 * `loadFactor`) - the app's data model is week-oriented (periodization,
 * templates, the Analytics.svelte charts), and most of these metrics
 * (adherence, ramp rate) are inherently week-over-week comparisons anyway.
 *
 * ACWR is the one exception (UI_PLAN.md §5.3, 2026-09-18): every completed
 * workout always has a real `date`, so a week-bucketed ratio isn't actually
 * forced by the data model for that specific metric, and a bucketed ratio
 * makes ACWR unusable as a *daily* readiness input (it would spuriously
 * swing every Monday/Sunday). `calculateRollingAcwr`/`calculateRollingAcwrSeries`
 * below are the canonical rolling 7-day-acute/28-day-chronic definition;
 * `calculateAcwrForWeeks` samples them at each week's end date rather than
 * keeping its own separate bucketed ratio calculation.
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

// The lower/upper bounds of the commonly cited ACWR "sweet spot" (Gabbett
// 2016 and follow-on literature) - below it is undertraining relative to
// chronic baseline (not flagged as risk by this app), between the two is
// the target zone, and ACWR_CAUTION_RATIO..ACWR_HIGH_RISK_RATIO is the
// caution band UI_PLAN.md §3.3's decision table names explicitly ("ACWR
// 1.3-1.5"). Used by the merged Rolling Load/ACWR panel (UI_PLAN.md §4.6,
// Stage 5) to render the three status bands - tunable defaults, same
// precedent as RAMP_RATE_SPIKE_THRESHOLD/ACWR_HIGH_RISK_RATIO above.
export const ACWR_SWEET_SPOT_MIN = 0.8;
export const ACWR_CAUTION_RATIO = 1.3;

// 6+ consecutive days of training with no rest day is a simple, commonly
// used heuristic for overtraining/recovery risk. Tunable default.
export const CONSECUTIVE_TRAINING_DAY_THRESHOLD = 6;

/** Total `loadFactor` of completed workouts in a given week. */
export function calculateWeeklyLoad(workouts: Workout[], weekId: string): number {
  return workouts
    .filter((w) => w.status === "completed" && w.weekId === weekId)
    .reduce((sum, w) => sum + (w.loadFactor || 0), 0);
}

export interface RollingAcwrResult {
  /** Sum of completed `loadFactor` over the trailing `acuteDays` (today back `acuteDays - 1`), ending at `asOf`. */
  acuteLoad: number;
  /** Sum of completed `loadFactor` over the trailing `chronicDays`, divided by `chronicDays / acuteDays` - a weekly-equivalent average directly comparable to `acuteLoad`. */
  chronicLoad: number;
  /** acuteLoad / chronicLoad, undefined when chronicLoad is 0 (no baseline load to compare against, regardless of `sufficient`). */
  ratio: number | undefined;
  /** Calendar days from the earliest completed workout through `asOf`, inclusive. 0 if there are no completed workouts. */
  daysCovered: number;
  /**
   * True once `daysCovered >= chronicDays` - i.e. the chronic window is
   * actually backed by that many days of real history, not padded with
   * zeros. Before that, `chronicLoad` is understated and `ratio` reads
   * alarmingly high; callers must degrade (skip a penalty, label it
   * "building history") rather than present the ratio as fact - see
   * UI_PLAN.md §5.2/§5.3. Independent of whether `ratio` itself is defined:
   * a long-inactive athlete can have `sufficient: true` (plenty of history)
   * and `ratio: undefined` (literally zero load in the current window).
   */
  sufficient: boolean;
}

/**
 * Rolling 7-day-acute/28-day-chronic ACWR (UI_PLAN.md §5.3), recalculated
 * fresh as of any `asOf` date - the canonical definition of "ACWR" in this
 * app, replacing the old week-bucketed ratio. Works in UTC calendar-day
 * indices throughout (`toUtcDayIndex`) rather than millisecond arithmetic on
 * local dates, per §5.3's explicit DST warning.
 */
export function calculateRollingAcwr(
  workouts: Workout[],
  asOf: Date,
  { acuteDays = 7, chronicDays = 28 }: { acuteDays?: number; chronicDays?: number } = {},
): RollingAcwrResult {
  const completed = workouts.filter((w) => w.status === "completed" && w.date);
  if (completed.length === 0) {
    return { acuteLoad: 0, chronicLoad: 0, ratio: undefined, daysCovered: 0, sufficient: false };
  }

  const asOfDay = toUtcDayIndex(asOf.toISOString());
  const loadByDay = new Map<number, number>();
  let earliestDay = Infinity;
  for (const w of completed) {
    const day = toUtcDayIndex(w.date!);
    loadByDay.set(day, (loadByDay.get(day) ?? 0) + (w.loadFactor || 0));
    if (day < earliestDay) earliestDay = day;
  }

  const sumWindow = (days: number): number => {
    let sum = 0;
    for (let d = asOfDay - days + 1; d <= asOfDay; d++) sum += loadByDay.get(d) ?? 0;
    return sum;
  };

  const acuteLoad = sumWindow(acuteDays);
  const chronicLoad = sumWindow(chronicDays) / (chronicDays / acuteDays);
  const ratio = chronicLoad > 0 ? acuteLoad / chronicLoad : undefined;
  const daysCovered = asOfDay - earliestDay + 1;

  return { acuteLoad, chronicLoad, ratio, daysCovered, sufficient: daysCovered >= chronicDays };
}

export interface RollingAcwrPoint extends RollingAcwrResult {
  /** ISO datetime of the sample point (the `asOf` passed in), for chart x-axes and week-end lookups. */
  date: string;
}

/** `calculateRollingAcwr` sampled at each of `sampleDates` - one code path so a chart and a same-day readiness score can never disagree (UI_PLAN.md §5.3/§4.6). */
export function calculateRollingAcwrSeries(workouts: Workout[], sampleDates: Date[]): RollingAcwrPoint[] {
  return sampleDates.map((asOf) => ({ date: asOf.toISOString(), ...calculateRollingAcwr(workouts, asOf) }));
}

/** `calculateRollingAcwr` sampled at `weekId`'s UTC end date (Sunday), or zeroed fields for a malformed id rather than a nondeterministic "now" fallback. */
function rollingAcwrAtWeekEnd(workouts: Workout[], weekId: string): RollingAcwrResult {
  const dates = getWeekDates(weekId);
  if (!dates) return { acuteLoad: 0, chronicLoad: 0, ratio: undefined, daysCovered: 0, sufficient: false };
  return calculateRollingAcwr(workouts, dates.end);
}

export interface AcwrResult {
  weekId: string;
  /** Rolling 7-day acute load as of this week's end date - see `calculateRollingAcwr`. Not a week-bucket total. */
  acuteLoad: number;
  /** Rolling 28-day chronic load (weekly-equivalent average) as of this week's end date. */
  chronicLoad: number;
  /** acuteLoad / chronicLoad, undefined when chronicLoad is 0. */
  ratio: number | undefined;
  /** Whether the rolling window above is backed by enough history to trust - see `RollingAcwrResult.sufficient`. */
  sufficient: boolean;
  /** Week-over-week % change in this week's *bucketed* completed load vs the previous week - a deliberately different, still week-bucketed metric from the rolling ratio above (UI_PLAN.md §5.3: "a different metric from ACWR, not a bucketed version of it"). 0 if there's no previous week or it had no load. */
  rampRate: number;
  /** rampRate exceeds RAMP_RATE_SPIKE_THRESHOLD. */
  spike: boolean;
}

/**
 * Computes the rolling ACWR ratio (sampled at each week's end date) plus
 * week-over-week ramp-rate for every week in `orderedWeekIds` (must be in
 * chronological order - ramp-rate looks backward from each entry's position
 * in this array, not by parsing the week id itself).
 */
export function calculateAcwrForWeeks(workouts: Workout[], orderedWeekIds: string[]): AcwrResult[] {
  return orderedWeekIds.map((weekId, i) => {
    const rolling = rollingAcwrAtWeekEnd(workouts, weekId);

    const weeklyLoad = calculateWeeklyLoad(workouts, weekId);
    const prevWeekId = i > 0 ? orderedWeekIds[i - 1] : undefined;
    const prevLoad = prevWeekId !== undefined ? calculateWeeklyLoad(workouts, prevWeekId) : undefined;
    const rampRate = prevLoad ? (weeklyLoad - prevLoad) / prevLoad : 0;

    return {
      weekId,
      acuteLoad: rolling.acuteLoad,
      chronicLoad: rolling.chronicLoad,
      ratio: rolling.ratio,
      sufficient: rolling.sufficient,
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

    // The high-ratio check additionally requires `sufficient` - an inflated
    // ratio from an understated chronic baseline (early history) isn't a
    // real signal, same reasoning as readiness's penalty skip (UI_PLAN.md
    // §5.2/§5.3). `spike` (rampRate-based) is unaffected - it's a distinct,
    // always-week-bucketed metric.
    const loadSpikeNearby = !!(
      week?.spike ||
      prevWeek?.spike ||
      (week && week.sufficient && week.ratio !== undefined && week.ratio > ACWR_HIGH_RISK_RATIO)
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

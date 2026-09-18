import { describe, it, expect } from "vitest";
import type { Workout, DailyMetricEntry, PainLog } from "../types";
import { getWeekId } from "../dateUtils";
import {
  RAMP_RATE_SPIKE_THRESHOLD,
  ACWR_HIGH_RISK_RATIO,
  CONSECUTIVE_TRAINING_DAY_THRESHOLD,
  calculateWeeklyLoad,
  calculateRollingAcwr,
  calculateRollingAcwrSeries,
  calculateAcwrForWeeks,
  calculateWorkoutAdherence,
  calculateWeeklyAdherence,
  findConsecutiveTrainingDayWarnings,
  findRecoveryWarnings,
  correlatePainWithLoadSpikes,
  type AcwrResult,
} from "./loadAnalytics";

function makeWorkout(overrides: Partial<Workout>): Workout {
  return {
    id: "w",
    status: "planned",
    date: null,
    weekId: "2026-W01",
    loadFactor: 0,
    exercises: [],
    ...overrides,
  };
}

describe("calculateWeeklyLoad", () => {
  it("sums loadFactor only across completed workouts in the given week", () => {
    const workouts = [
      makeWorkout({ status: "completed", weekId: "W1", loadFactor: 10 }),
      makeWorkout({ status: "completed", weekId: "W1", loadFactor: 5 }),
      makeWorkout({ status: "planned", weekId: "W1", loadFactor: 999 }),
      makeWorkout({ status: "completed", weekId: "W2", loadFactor: 3 }),
    ];
    expect(calculateWeeklyLoad(workouts, "W1")).toBe(15);
    expect(calculateWeeklyLoad(workouts, "W2")).toBe(3);
    expect(calculateWeeklyLoad(workouts, "W3")).toBe(0);
  });
});

describe("calculateRollingAcwr (UI_PLAN.md §5.3 - rolling 7-day acute / 28-day chronic window, replacing week buckets)", () => {
  const asOf = new Date(Date.UTC(2026, 2, 28)); // 2026-03-28, UTC midnight

  /** `n` completed workouts of `loadFactor` each, one per day, the most recent on `asOf`, going backward. */
  function dailyWorkouts(count: number, loadFactor: number): Workout[] {
    return Array.from({ length: count }, (_, i) => {
      const date = new Date(asOf.getTime() - i * 86400000).toISOString().split("T")[0];
      return makeWorkout({ status: "completed", date, loadFactor });
    });
  }

  it("no completed workouts -> zero load, undefined ratio, not sufficient", () => {
    expect(calculateRollingAcwr([], asOf)).toEqual({
      acuteLoad: 0,
      chronicLoad: 0,
      ratio: undefined,
      daysCovered: 0,
      sufficient: false,
    });
  });

  it("ignores planned (not completed) workouts", () => {
    const workouts = [makeWorkout({ status: "planned", date: asOf.toISOString().split("T")[0], loadFactor: 999 })];
    expect(calculateRollingAcwr(workouts, asOf).acuteLoad).toBe(0);
  });

  it("a single workout today: acute = its load, chronic = load/4 (weekly-equivalent of a 28-day sum), not yet sufficient", () => {
    const workouts = dailyWorkouts(1, 10);
    const r = calculateRollingAcwr(workouts, asOf);
    expect(r.acuteLoad).toBe(10);
    expect(r.chronicLoad).toBeCloseTo(10 / 4, 10);
    expect(r.ratio).toBeCloseTo(4, 10);
    expect(r.daysCovered).toBe(1);
    expect(r.sufficient).toBe(false);
  });

  it("exactly 28 days of even daily history: acute = 7*load, chronic = 28*load/4 = 7*load, ratio = 1, sufficient", () => {
    const workouts = dailyWorkouts(28, 10);
    const r = calculateRollingAcwr(workouts, asOf);
    expect(r.acuteLoad).toBe(70);
    expect(r.chronicLoad).toBeCloseTo(70, 10);
    expect(r.ratio).toBeCloseTo(1, 10);
    expect(r.daysCovered).toBe(28);
    expect(r.sufficient).toBe(true);
  });

  it("earliest workout exactly 27 days before asOf (28-day inclusive span) -> sufficient", () => {
    const workouts = [makeWorkout({ status: "completed", date: new Date(asOf.getTime() - 27 * 86400000).toISOString().split("T")[0], loadFactor: 10 })];
    expect(calculateRollingAcwr(workouts, asOf).daysCovered).toBe(28);
    expect(calculateRollingAcwr(workouts, asOf).sufficient).toBe(true);
  });

  it("earliest workout 26 days before asOf (27-day inclusive span) -> not sufficient", () => {
    const workouts = [makeWorkout({ status: "completed", date: new Date(asOf.getTime() - 26 * 86400000).toISOString().split("T")[0], loadFactor: 10 })];
    expect(calculateRollingAcwr(workouts, asOf).daysCovered).toBe(27);
    expect(calculateRollingAcwr(workouts, asOf).sufficient).toBe(false);
  });

  it("history exists but nothing in the last 28 days -> sufficient can be true while ratio stays undefined (chronicLoad is 0, not 'no history')", () => {
    const oldDate = new Date(asOf.getTime() - 40 * 86400000).toISOString().split("T")[0];
    const workouts = [makeWorkout({ status: "completed", date: oldDate, loadFactor: 10 })];
    const r = calculateRollingAcwr(workouts, asOf);
    expect(r.acuteLoad).toBe(0);
    expect(r.chronicLoad).toBe(0);
    expect(r.ratio).toBeUndefined();
    expect(r.sufficient).toBe(true);
  });

  it("respects custom acuteDays/chronicDays", () => {
    const workouts = dailyWorkouts(14, 10);
    const r = calculateRollingAcwr(workouts, asOf, { acuteDays: 3, chronicDays: 14 });
    expect(r.acuteLoad).toBe(30); // 3 days * 10
    expect(r.chronicLoad).toBeCloseTo((14 * 10) / (14 / 3), 10);
    expect(r.daysCovered).toBe(14);
    expect(r.sufficient).toBe(true);
  });
});

describe("calculateRollingAcwrSeries", () => {
  it("samples calculateRollingAcwr at each given date, tagging each point with its sample date", () => {
    const asOf1 = new Date(Date.UTC(2026, 2, 1));
    const asOf2 = new Date(Date.UTC(2026, 2, 8));
    const workouts = [
      makeWorkout({ status: "completed", date: "2026-03-01", loadFactor: 10 }),
      makeWorkout({ status: "completed", date: "2026-03-08", loadFactor: 20 }),
    ];

    const series = calculateRollingAcwrSeries(workouts, [asOf1, asOf2]);
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ date: asOf1.toISOString(), acuteLoad: 10 });
    expect(series[1]).toMatchObject({ date: asOf2.toISOString(), acuteLoad: 20 });
    // Each point matches calling calculateRollingAcwr directly for that date - one code path, not two.
    expect(series[1]).toMatchObject(calculateRollingAcwr(workouts, asOf2));
  });
});

describe("calculateAcwrForWeeks (UI_PLAN.md §5.3 - ratio/acuteLoad/chronicLoad/sufficient now come from calculateRollingAcwr sampled at each week's UTC end date; rampRate/spike stay week-bucketed, per §5.3's own 'different metric' note)", () => {
  it("acuteLoad/chronicLoad/ratio/sufficient for a week equal calculateRollingAcwr sampled at that week's end date", () => {
    // 2026-W12 ends 2026-03-22 (see dateUtils.test.ts). Build 28 days of
    // even daily load ending exactly on that date so the rolling window is
    // fully "sufficient" and independently checkable by hand.
    const weekEnd = new Date(Date.UTC(2026, 2, 22));
    const workouts = Array.from({ length: 28 }, (_, i) => {
      const date = new Date(weekEnd.getTime() - i * 86400000).toISOString().split("T")[0];
      return makeWorkout({ status: "completed", date, loadFactor: 10 });
    });

    const [result] = calculateAcwrForWeeks(workouts, ["2026-W12"]);
    const expected = calculateRollingAcwr(workouts, weekEnd);
    expect(result.acuteLoad).toBe(expected.acuteLoad);
    expect(result.chronicLoad).toBe(expected.chronicLoad);
    expect(result.ratio).toBe(expected.ratio);
    expect(result.sufficient).toBe(expected.sufficient);
  });

  it("rampRate/spike are still week-bucketed (calculateWeeklyLoad), independent of the rolling acuteLoad/chronicLoad/ratio above", () => {
    // Week-bucketed completed load: W1=10, W2=20 (a +100% week-over-week ramp, a spike),
    // deliberately on dates far enough apart that their rolling windows don't overlap.
    const workouts = [
      makeWorkout({ status: "completed", weekId: "2026-W01", date: "2025-12-29", loadFactor: 10 }),
      makeWorkout({ status: "completed", weekId: "2026-W02", date: "2026-01-05", loadFactor: 20 }),
    ];
    const [w1, w2] = calculateAcwrForWeeks(workouts, ["2026-W01", "2026-W02"]);
    expect(w1.rampRate).toBe(0);
    expect(w1.spike).toBe(false);
    expect(w2.rampRate).toBeCloseTo(1.0, 10);
    expect(w2.spike).toBe(true);
  });

  it("a malformed week id yields zeroed rolling fields rather than a nondeterministic 'now' sample", () => {
    const [result] = calculateAcwrForWeeks([], ["not-a-real-week"]);
    expect(result.acuteLoad).toBe(0);
    expect(result.chronicLoad).toBe(0);
    expect(result.ratio).toBeUndefined();
    expect(result.sufficient).toBe(false);
  });

  it("RAMP_RATE_SPIKE_THRESHOLD is the documented 10% rule of thumb", () => {
    expect(RAMP_RATE_SPIKE_THRESHOLD).toBe(0.1);
  });
});

describe("calculateWorkoutAdherence", () => {
  // plannedLoad: 1 makes calculatePlannedLoad(duration, plannedLoad) reduce
  // to exactly `duration` (1^1.2 === 1), so expected values are exact
  // round numbers rather than requiring re-deriving the load formula's
  // fractional exponent by hand.
  it("diffs prescribed vs logged per slot; a slot with no logged data falls back to prescribed for 'actual'", () => {
    const workout = makeWorkout({
      status: "completed",
      exercises: [
        {
          id: "a",
          typeId: "t1",
          prescribed: { duration: 60, plannedLoad: 1 },
          logged: { duration: 50, plannedLoad: 1 },
        },
        {
          id: "b",
          typeId: "t1",
          prescribed: { duration: 30, plannedLoad: 1 },
          // no `logged` - never actually recorded
        },
      ],
    });

    const result = calculateWorkoutAdherence(workout);
    expect(result.totalSlots).toBe(2);
    expect(result.loggedSlots).toBe(1);
    expect(result.completionRate).toBe(0.5);
    expect(result.plannedLoad).toBe(90); // 60 + 30
    expect(result.actualLoad).toBe(80); // 50 (logged) + 30 (fallback to prescribed)
    expect(result.loadVariance).toBe(-10);
  });

  it("a workout with no exercises has a completion rate of 0, not NaN", () => {
    const result = calculateWorkoutAdherence(makeWorkout({ exercises: [] }));
    expect(result.completionRate).toBe(0);
    expect(result.totalSlots).toBe(0);
  });
});

describe("calculateWeeklyAdherence", () => {
  it("aggregates adherence across completed workouts in the week, excluding planned ones", () => {
    const workouts = [
      makeWorkout({
        weekId: "W1",
        status: "completed",
        exercises: [
          { id: "a", typeId: "t1", prescribed: { duration: 60, plannedLoad: 1 }, logged: { duration: 50, plannedLoad: 1 } },
          { id: "b", typeId: "t1", prescribed: { duration: 30, plannedLoad: 1 } },
        ],
      }),
      makeWorkout({
        weekId: "W1",
        status: "completed",
        exercises: [
          { id: "c", typeId: "t1", prescribed: { duration: 20, plannedLoad: 1 }, logged: { duration: 25, plannedLoad: 1 } },
        ],
      }),
      makeWorkout({
        weekId: "W1",
        status: "planned",
        exercises: [{ id: "d", typeId: "t1", prescribed: { duration: 999, plannedLoad: 1 } }],
      }),
    ];

    const result = calculateWeeklyAdherence(workouts, "W1");
    expect(result.completionRate).toBeCloseTo(2 / 3, 10); // 2 logged of 3 total slots across the 2 completed workouts
    expect(result.plannedLoad).toBe(110); // 90 + 20
    expect(result.actualLoad).toBe(105); // 80 + 25
    expect(result.loadVariance).toBe(-5);
  });
});

describe("findConsecutiveTrainingDayWarnings", () => {
  it("flags a run of 6+ consecutive completed-workout days (default threshold)", () => {
    const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"];
    const workouts = dates.map((date) => makeWorkout({ status: "completed", date }));
    const warnings = findConsecutiveTrainingDayWarnings(workouts);
    expect(warnings).toEqual([{ date: "2026-01-06", reason: "6 consecutive training days without a rest day" }]);
  });

  it("does not flag a run shorter than the threshold", () => {
    const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
    const workouts = dates.map((date) => makeWorkout({ status: "completed", date }));
    expect(findConsecutiveTrainingDayWarnings(workouts)).toEqual([]);
  });

  it("respects a custom threshold", () => {
    const dates = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const workouts = dates.map((date) => makeWorkout({ status: "completed", date }));
    expect(findConsecutiveTrainingDayWarnings(workouts, 3)).toEqual([
      { date: "2026-01-03", reason: "3 consecutive training days without a rest day" },
    ]);
  });

  it("a gap resets the streak", () => {
    const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-10"];
    const workouts = dates.map((date) => makeWorkout({ status: "completed", date }));
    expect(findConsecutiveTrainingDayWarnings(workouts, 3)).toEqual([
      { date: "2026-01-03", reason: "3 consecutive training days without a rest day" },
    ]);
  });

  it("CONSECUTIVE_TRAINING_DAY_THRESHOLD default is 6", () => {
    expect(CONSECUTIVE_TRAINING_DAY_THRESHOLD).toBe(6);
  });
});

describe("findRecoveryWarnings", () => {
  const week1 = getWeekId(new Date("2026-03-02"));
  const week2 = getWeekId(new Date("2026-03-09"));

  it("flags a week with a load spike alongside declining sleep score", () => {
    const workouts = [
      makeWorkout({ status: "completed", weekId: week1, loadFactor: 10, date: "2026-03-02" }),
      makeWorkout({ status: "completed", weekId: week2, loadFactor: 20, date: "2026-03-09" }),
    ];
    const dailyMetrics: DailyMetricEntry[] = [
      { id: "m1", metricId: "sleep-score", date: "2026-03-02", value: 80 },
      { id: "m2", metricId: "sleep-score", date: "2026-03-09", value: 60 },
    ];

    const warnings = findRecoveryWarnings(workouts, dailyMetrics, [week1, week2]);
    expect(warnings).toEqual([
      { date: week2, reason: "Load spiked 100% week-over-week while readiness declined (sleep score down)" },
    ]);
  });

  it("does not flag a load spike when readiness improved instead of declining", () => {
    const workouts = [
      makeWorkout({ status: "completed", weekId: week1, loadFactor: 10, date: "2026-03-02" }),
      makeWorkout({ status: "completed", weekId: week2, loadFactor: 20, date: "2026-03-09" }),
    ];
    const dailyMetrics: DailyMetricEntry[] = [
      { id: "m1", metricId: "sleep-score", date: "2026-03-02", value: 60 },
      { id: "m2", metricId: "sleep-score", date: "2026-03-09", value: 80 },
      { id: "m3", metricId: "hrv", date: "2026-03-02", value: 40 },
      { id: "m4", metricId: "hrv", date: "2026-03-09", value: 50 },
      { id: "m5", metricId: "rhr", date: "2026-03-02", value: 55 },
      { id: "m6", metricId: "rhr", date: "2026-03-09", value: 50 },
    ];

    expect(findRecoveryWarnings(workouts, dailyMetrics, [week1, week2])).toEqual([]);
  });

  it("includes consecutive-training-day warnings alongside readiness warnings", () => {
    const trainingDays = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"];
    const workouts = trainingDays.map((date) => makeWorkout({ status: "completed", weekId: "W1", loadFactor: 1, date }));
    const warnings = findRecoveryWarnings(workouts, [], ["W1"]);
    expect(warnings).toEqual([{ date: "2026-01-06", reason: "6 consecutive training days without a rest day" }]);
  });
});

describe("correlatePainWithLoadSpikes", () => {
  const acwr: AcwrResult[] = [
    { weekId: "W1", acuteLoad: 10, chronicLoad: 10, ratio: 1, sufficient: true, rampRate: 0, spike: false },
    { weekId: "W2", acuteLoad: 20, chronicLoad: 10, ratio: 2.0, sufficient: true, rampRate: 1.0, spike: true },
    { weekId: "W3", acuteLoad: 5, chronicLoad: 12, ratio: 0.4167, sufficient: true, rampRate: -0.75, spike: false },
    { weekId: "W5", acuteLoad: 1, chronicLoad: 1, ratio: 2.0, sufficient: true, rampRate: 0, spike: false },
  ];

  function makeLog(overrides: Partial<PainLog>): PainLog {
    return { id: "p", date: "2026-01-01", weekId: "W1", bodyPart: "Fingers", severity: 5, ...overrides };
  }

  it("no spike this week, no previous week, ratio within normal range -> not correlated", () => {
    const [result] = correlatePainWithLoadSpikes([makeLog({ id: "1", weekId: "W1" })], acwr);
    expect(result.loadSpikeNearby).toBe(false);
  });

  it("this week itself spiked -> correlated", () => {
    const [result] = correlatePainWithLoadSpikes([makeLog({ id: "2", weekId: "W2" })], acwr);
    expect(result.loadSpikeNearby).toBe(true);
  });

  it("the previous week spiked (even though this week didn't) -> correlated", () => {
    const [result] = correlatePainWithLoadSpikes([makeLog({ id: "3", weekId: "W3" })], acwr);
    expect(result.loadSpikeNearby).toBe(true);
  });

  it("a week not present in the ACWR series -> not correlated (nothing to compare against)", () => {
    const [result] = correlatePainWithLoadSpikes([makeLog({ id: "4", weekId: "W4" })], acwr);
    expect(result.loadSpikeNearby).toBe(false);
  });

  it("a high absolute ACWR ratio (>1.5) counts as correlated even without a week-over-week spike", () => {
    const [result] = correlatePainWithLoadSpikes([makeLog({ id: "5", weekId: "W5" })], acwr);
    expect(result.loadSpikeNearby).toBe(true);
  });

  it("ACWR_HIGH_RISK_RATIO is the documented 1.5 rule of thumb", () => {
    expect(ACWR_HIGH_RISK_RATIO).toBe(1.5);
  });

  it("passes through the log's own fields unchanged", () => {
    const [result] = correlatePainWithLoadSpikes(
      [makeLog({ id: "6", weekId: "W1", date: "2026-02-02", severity: 7, bodyPart: "Elbow" })],
      acwr,
    );
    expect(result).toMatchObject({ painLogId: "6", date: "2026-02-02", weekId: "W1", severity: 7, bodyPart: "Elbow" });
  });

  it("an undefined ratio (no chronic load yet) never counts as correlated by itself", () => {
    const acwrWithUndefinedRatio: AcwrResult[] = [
      { weekId: "W6", acuteLoad: 0, chronicLoad: 0, ratio: undefined, sufficient: false, rampRate: 0, spike: false },
    ];
    const [result] = correlatePainWithLoadSpikes([makeLog({ id: "7", weekId: "W6" })], acwrWithUndefinedRatio);
    expect(result.loadSpikeNearby).toBe(false);
  });

  it("a high ratio during a not-yet-sufficient 'building history' window does not count as correlated on its own (the baseline is understated, not trustworthy - UI_PLAN.md §5.3)", () => {
    const acwrInsufficient: AcwrResult[] = [
      { weekId: "W7", acuteLoad: 10, chronicLoad: 2, ratio: 5, sufficient: false, rampRate: 0, spike: false },
    ];
    const [result] = correlatePainWithLoadSpikes([makeLog({ id: "8", weekId: "W7" })], acwrInsufficient);
    expect(result.loadSpikeNearby).toBe(false);
  });

  it("a high ratio still counts as correlated once the window is sufficient", () => {
    const acwrSufficient: AcwrResult[] = [
      { weekId: "W8", acuteLoad: 10, chronicLoad: 2, ratio: 5, sufficient: true, rampRate: 0, spike: false },
    ];
    const [result] = correlatePainWithLoadSpikes([makeLog({ id: "9", weekId: "W8" })], acwrSufficient);
    expect(result.loadSpikeNearby).toBe(true);
  });
});

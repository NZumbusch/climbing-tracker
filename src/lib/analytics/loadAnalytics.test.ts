import { describe, it, expect } from "vitest";
import type { Workout, DailyMetricEntry, PainLog } from "../types";
import { getWeekId } from "../dateUtils";
import {
  RAMP_RATE_SPIKE_THRESHOLD,
  ACWR_HIGH_RISK_RATIO,
  CONSECUTIVE_TRAINING_DAY_THRESHOLD,
  calculateWeeklyLoad,
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

describe("calculateAcwrForWeeks", () => {
  // Hand-computed 5-week series. Completed load per week: W1=10, W2=20,
  // W3=0 (no workouts), W4=40, W5=10.
  const workouts = [
    makeWorkout({ status: "completed", weekId: "W1", loadFactor: 10 }),
    makeWorkout({ status: "completed", weekId: "W2", loadFactor: 20 }),
    makeWorkout({ status: "completed", weekId: "W4", loadFactor: 40 }),
    makeWorkout({ status: "completed", weekId: "W5", loadFactor: 10 }),
  ];
  const weeks = ["W1", "W2", "W3", "W4", "W5"];
  const results = calculateAcwrForWeeks(workouts, weeks);

  it("W1: no prior weeks - chronic equals acute, no ramp rate", () => {
    expect(results[0]).toEqual({ weekId: "W1", acuteLoad: 10, chronicLoad: 10, ratio: 1, rampRate: 0, spike: false });
  });

  it("W2: chronic = avg(10,20) = 15, ratio = 20/15, rampRate = +100% -> spike", () => {
    const r = results[1];
    expect(r.acuteLoad).toBe(20);
    expect(r.chronicLoad).toBe(15);
    expect(r.ratio).toBeCloseTo(20 / 15, 10);
    expect(r.rampRate).toBeCloseTo(1.0, 10);
    expect(r.spike).toBe(true);
  });

  it("W3: acute drops to 0, chronic = avg(10,20,0) = 10, ratio = 0, rampRate = -100% (not a spike, only positive ramps count)", () => {
    const r = results[2];
    expect(r.acuteLoad).toBe(0);
    expect(r.chronicLoad).toBeCloseTo(10, 10);
    expect(r.ratio).toBe(0);
    expect(r.rampRate).toBeCloseTo(-1.0, 10);
    expect(r.spike).toBe(false);
  });

  it("W4: chronic window is the full 4-week trailing max (avg(10,20,0,40)=17.5); previous week's load was 0, so rampRate is defined as 0 (no baseline to ramp from), not Infinity", () => {
    const r = results[3];
    expect(r.acuteLoad).toBe(40);
    expect(r.chronicLoad).toBeCloseTo(17.5, 10);
    expect(r.ratio).toBeCloseTo(40 / 17.5, 10);
    expect(r.rampRate).toBe(0);
    expect(r.spike).toBe(false);
  });

  it("W5: chronic window slides to the trailing 4 weeks (avg(20,0,40,10)=17.5), rampRate = -75% vs W4's 40", () => {
    const r = results[4];
    expect(r.acuteLoad).toBe(10);
    expect(r.chronicLoad).toBeCloseTo(17.5, 10);
    expect(r.ratio).toBeCloseTo(10 / 17.5, 10);
    expect(r.rampRate).toBeCloseTo(-0.75, 10);
    expect(r.spike).toBe(false);
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
    { weekId: "W1", acuteLoad: 10, chronicLoad: 10, ratio: 1, rampRate: 0, spike: false },
    { weekId: "W2", acuteLoad: 20, chronicLoad: 10, ratio: 2.0, rampRate: 1.0, spike: true },
    { weekId: "W3", acuteLoad: 5, chronicLoad: 12, ratio: 0.4167, rampRate: -0.75, spike: false },
    { weekId: "W5", acuteLoad: 1, chronicLoad: 1, ratio: 2.0, rampRate: 0, spike: false },
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
});

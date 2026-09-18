import { describe, it, expect } from "vitest";
import type { Workout, DailyMetricEntry } from "../types";
import {
  computeFatigueDecay,
  computeHrvBaseline,
  computeReadiness,
  READINESS_GOOD_THRESHOLD,
  READINESS_CAUTION_THRESHOLD,
  MAX_FATIGUE_PENALTY,
  MAX_ACWR_PENALTY,
  MAX_SLEEP_PENALTY,
  MAX_HRV_PENALTY,
  SLEEP_SCORE_LOW_THRESHOLD,
} from "./readiness";
import { ACWR_HIGH_RISK_RATIO, type RollingAcwrResult } from "./loadAnalytics";

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

const asOf = new Date(Date.UTC(2026, 2, 28)); // 2026-03-28

describe("computeFatigueDecay", () => {
  it("no workouts -> every axis undefined, zero coverage", () => {
    const r = computeFatigueDecay([], asOf);
    expect(r).toEqual({
      fingers: undefined,
      arms: undefined,
      core: undefined,
      systemic: undefined,
      coverage: { total: 0, fingers: 0, arms: 0, core: 0, systemic: 0 },
    });
  });

  it("ignores planned workouts", () => {
    const r = computeFatigueDecay([makeWorkout({ status: "planned", date: "2026-03-28", fingers: 9 })], asOf);
    expect(r.fingers).toBeUndefined();
    expect(r.coverage.total).toBe(0);
  });

  it("a single completed workout today carries full weight - axis value equals its raw value", () => {
    const r = computeFatigueDecay(
      [makeWorkout({ status: "completed", date: "2026-03-28", fingers: 8, core: 4 })],
      asOf,
    );
    expect(r.fingers).toBeCloseTo(8, 10);
    expect(r.core).toBeCloseTo(4, 10);
    expect(r.arms).toBeUndefined();
    expect(r.systemic).toBeUndefined();
    expect(r.coverage).toEqual({ total: 1, fingers: 1, arms: 0, core: 1, systemic: 0 });
  });

  it("hand-computed 3-day-half-life weighting: a workout exactly one half-life ago weighs half as much as today's", () => {
    // weight(today) = 1, weight(3 days ago) = 0.5 (half-life = 3 by default).
    // fingers-weighted avg = (1*2 + 0.5*10) / (1 + 0.5) = 7 / 1.5.
    const workouts = [
      makeWorkout({ status: "completed", date: "2026-03-28", fingers: 2 }),
      makeWorkout({ status: "completed", date: "2026-03-25", fingers: 10 }),
    ];
    const r = computeFatigueDecay(workouts, asOf);
    expect(r.fingers).toBeCloseTo(7 / 1.5, 10);
  });

  it("an axis missing on some workouts is excluded from that axis's average, not imputed", () => {
    const workouts = [
      makeWorkout({ status: "completed", date: "2026-03-28", fingers: 6, arms: 6 }),
      // No `arms` - e.g. a pre-arms-slider historical workout.
      makeWorkout({ status: "completed", date: "2026-03-27", fingers: 2 }),
    ];
    const r = computeFatigueDecay(workouts, asOf);
    // arms average is just the one workout that carries it, not diluted by the other's absence.
    expect(r.arms).toBeCloseTo(6, 10);
    expect(r.coverage).toEqual({ total: 2, fingers: 2, arms: 1, core: 0, systemic: 0 });
  });

  it("respects a custom half-life", () => {
    // half-life = 1: a workout 1 day ago weighs half as much as today's.
    const workouts = [
      makeWorkout({ status: "completed", date: "2026-03-28", fingers: 2 }),
      makeWorkout({ status: "completed", date: "2026-03-27", fingers: 10 }),
    ];
    const r = computeFatigueDecay(workouts, asOf, 1);
    expect(r.fingers).toBeCloseTo((1 * 2 + 0.5 * 10) / 1.5, 10);
  });

  it("clamps a workout dated after asOf to full weight rather than a >1 weight", () => {
    const workouts = [makeWorkout({ status: "completed", date: "2026-04-05", fingers: 6 })];
    const r = computeFatigueDecay(workouts, asOf);
    expect(r.fingers).toBeCloseTo(6, 10);
  });
});

describe("computeHrvBaseline", () => {
  it("no hrv entries -> undefined", () => {
    expect(computeHrvBaseline([], asOf)).toBeUndefined();
  });

  it("averages hrv entries within the trailing 14-day window (default)", () => {
    const entries: DailyMetricEntry[] = [
      { id: "1", metricId: "hrv", date: "2026-03-28", value: 60 },
      { id: "2", metricId: "hrv", date: "2026-03-20", value: 40 },
    ];
    expect(computeHrvBaseline(entries, asOf)).toBeCloseTo(50, 10);
  });

  it("excludes entries older than the window and entries for other metrics", () => {
    const entries: DailyMetricEntry[] = [
      { id: "1", metricId: "hrv", date: "2026-03-28", value: 60 },
      { id: "2", metricId: "hrv", date: "2026-03-01", value: 999 }, // >14 days back
      { id: "3", metricId: "sleep-score", date: "2026-03-28", value: 1 },
    ];
    expect(computeHrvBaseline(entries, asOf)).toBeCloseTo(60, 10);
  });

  it("respects a custom window", () => {
    const entries: DailyMetricEntry[] = [
      { id: "1", metricId: "hrv", date: "2026-03-28", value: 60 }, // today (offset 0)
      { id: "2", metricId: "hrv", date: "2026-03-27", value: 40 }, // yesterday (offset 1)
    ];
    expect(computeHrvBaseline(entries, asOf, 2)).toBeCloseTo(50, 10); // both offsets < 2
    expect(computeHrvBaseline(entries, asOf, 1)).toBeCloseTo(60, 10); // only offset 0 < 1
  });
});

describe("computeReadiness", () => {
  const sufficientAcwr = (ratio: number | undefined): RollingAcwrResult => ({
    acuteLoad: 0,
    chronicLoad: 0,
    ratio,
    daysCovered: 28,
    sufficient: true,
  });
  const insufficientAcwr = (ratio: number | undefined): RollingAcwrResult => ({
    acuteLoad: 0,
    chronicLoad: 0,
    ratio,
    daysCovered: 5,
    sufficient: false,
  });

  it("no inputs at all -> undefined score, neutral status, nothing marked as used", () => {
    const r = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined) });
    expect(r.score).toBeUndefined();
    expect(r.status).toBe("neutral");
    expect(r.inputsUsed).toEqual({ fatigue: false, acwr: false, sleep: false, hrv: false });
  });

  it("fatigue-only, low fatigue -> near-max score, good status, only fatigue marked used", () => {
    const r = computeReadiness({
      fatigue: { fingers: 1, core: 1, systemic: 1 },
      acwr: insufficientAcwr(undefined),
    });
    expect(r.score).toBeCloseTo(100, 10); // (1-1)/9 * penalty = 0
    expect(r.status).toBe("good");
    expect(r.inputsUsed).toEqual({ fatigue: true, acwr: false, sleep: false, hrv: false });
  });

  it("fatigue-only, max fatigue -> score reduced by exactly MAX_FATIGUE_PENALTY", () => {
    const r = computeReadiness({
      fatigue: { fingers: 10, core: 10, systemic: 10 },
      acwr: insufficientAcwr(undefined),
    });
    expect(r.score).toBeCloseTo(100 - MAX_FATIGUE_PENALTY, 10);
  });

  it("an insufficient ACWR window is never used, even when a ratio value is present", () => {
    const r = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(5) });
    expect(r.inputsUsed.acwr).toBe(false);
    expect(r.score).toBeUndefined(); // no input was usable at all
  });

  it("a sufficient, high ACWR ratio costs up to MAX_ACWR_PENALTY, capped at the high-risk ratio", () => {
    const atThreshold = computeReadiness({ fatigue: {}, acwr: sufficientAcwr(ACWR_HIGH_RISK_RATIO) });
    expect(atThreshold.score).toBeCloseTo(100 - MAX_ACWR_PENALTY, 10);

    const wellAbove = computeReadiness({ fatigue: {}, acwr: sufficientAcwr(ACWR_HIGH_RISK_RATIO * 3) });
    expect(wellAbove.score).toBeCloseTo(100 - MAX_ACWR_PENALTY, 10); // still capped, not worse
  });

  it("a sufficient ACWR ratio at or below 1 costs nothing", () => {
    const r = computeReadiness({ fatigue: {}, acwr: sufficientAcwr(0.7) });
    expect(r.score).toBeCloseTo(100, 10);
  });

  it("sleep below the low threshold costs points proportionally; at/above it costs nothing", () => {
    const low = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), sleep: 0 });
    expect(low.score).toBeCloseTo(100 - MAX_SLEEP_PENALTY, 10);

    const atThreshold = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), sleep: SLEEP_SCORE_LOW_THRESHOLD });
    expect(atThreshold.score).toBeCloseTo(100, 10);

    const high = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), sleep: 95 });
    expect(high.score).toBeCloseTo(100, 10);
    expect(high.inputsUsed.sleep).toBe(true);
  });

  it("an HRV dip below the 14-day baseline costs points, scaling to the full penalty at a 100% dip; HRV at/above baseline costs nothing", () => {
    const fullDip = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), hrv: 0, hrvBaseline: 60 }); // 100% dip
    expect(fullDip.score).toBeCloseTo(100 - MAX_HRV_PENALTY, 10);

    // 50% dip: clamp((0.5 - 0.1) / (1 - 0.1), 0, 1) * MAX_HRV_PENALTY = (0.4/0.9) * MAX_HRV_PENALTY.
    const partialDip = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), hrv: 30, hrvBaseline: 60 });
    expect(partialDip.score).toBeCloseTo(100 - (0.4 / 0.9) * MAX_HRV_PENALTY, 10);

    const atBaseline = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), hrv: 60, hrvBaseline: 60 });
    expect(atBaseline.score).toBeCloseTo(100, 10);

    const aboveBaseline = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), hrv: 70, hrvBaseline: 60 });
    expect(aboveBaseline.score).toBeCloseTo(100, 10);
  });

  it("hrv without a baseline (not enough history) is not used", () => {
    const r = computeReadiness({ fatigue: {}, acwr: insufficientAcwr(undefined), hrv: 30 });
    expect(r.inputsUsed.hrv).toBe(false);
  });

  it("never scores below 0 or above 100 even when every penalty stacks", () => {
    const worst = computeReadiness({
      fatigue: { fingers: 10, core: 10, systemic: 10 },
      acwr: sufficientAcwr(10),
      sleep: 0,
      hrv: 1,
      hrvBaseline: 100,
    });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.score).toBeLessThanOrEqual(100);
  });

  it("status buckets follow the score thresholds", () => {
    expect(computeReadiness({ fatigue: { fingers: 1, core: 1, systemic: 1 }, acwr: insufficientAcwr(undefined) }).status).toBe("good");

    const cautionScore = 100 - (READINESS_GOOD_THRESHOLD - READINESS_CAUTION_THRESHOLD - 1);
    // Sanity: thresholds are ordered sensibly.
    expect(READINESS_GOOD_THRESHOLD).toBeGreaterThan(READINESS_CAUTION_THRESHOLD);
    expect(cautionScore).toBeGreaterThan(0);
  });

  it("confidence names what's missing when only fatigue is available", () => {
    const r = computeReadiness({ fatigue: { fingers: 3, core: 3, systemic: 3 }, acwr: insufficientAcwr(undefined) });
    expect(r.confidence.toLowerCase()).toContain("fatigue");
    expect(r.confidence.toLowerCase()).toContain("hrv");
  });

  it("advice describes state, not an instruction - never issues a directive like 'rest' or 'avoid'", () => {
    const r = computeReadiness({
      fatigue: { fingers: 10, core: 10, systemic: 10 },
      acwr: sufficientAcwr(3),
    });
    expect(r.advice.toLowerCase()).not.toMatch(/\b(avoid|do not|don't|must|should|rest today)\b/);
  });

  it("advice falls back to a steady-state message when nothing stands out", () => {
    const r = computeReadiness({ fatigue: { fingers: 3, core: 3, systemic: 3 }, acwr: sufficientAcwr(1) });
    expect(r.advice.length).toBeGreaterThan(0);
  });
});

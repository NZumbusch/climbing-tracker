import { describe, it, expect } from "vitest";
import { calculateLoadFactor, calculatePlannedLoad } from "./types";

describe("calculatePlannedLoad", () => {
  it("does not return NaN when called the way every real call site calls it (a single exercise-like object)", () => {
    // Regression test: calculatePlannedLoad used to take two positional
    // number args (duration, plannedIntensity), but every real call site in
    // storage.ts and state.svelte.ts already called it with a single
    // exercise object. That mismatch was invisible at runtime (JS doesn't
    // enforce arity) and produced NaN, since `Number(exerciseObject)` is NaN.
    const result = calculatePlannedLoad({ duration: 30, plannedLoad: 7 });
    expect(result).not.toBeNaN();
    expect(Number.isFinite(result)).toBe(true);
  });

  it("computes the documented formula: round(duration * intensity^1.2)", () => {
    expect(calculatePlannedLoad({ duration: 30, plannedLoad: 7 })).toBe(
      Math.round(30 * Math.pow(7, 1.2)),
    );
  });

  it("defaults duration to 60 and intensity to 5 when omitted", () => {
    expect(calculatePlannedLoad({})).toBe(Math.round(60 * Math.pow(5, 1.2)));
  });

  it("treats a duration of 0 as an explicit value, not a missing one", () => {
    expect(calculatePlannedLoad({ duration: 0, plannedLoad: 5 })).toBe(0);
  });
});

describe("calculateLoadFactor", () => {
  it("computes the documented formula: round(duration * weightedFatigue^1.2)", () => {
    const duration = 45;
    const fingers = 8;
    const core = 4;
    const systemic = 6;
    const weighted = fingers * 0.45 + systemic * 0.45 + core * 0.1;
    const expected = Math.round(duration * Math.pow(weighted, 1.2));
    expect(calculateLoadFactor(duration, fingers, core, systemic)).toBe(expected);
  });

  it("defaults duration to 60 when undefined", () => {
    const fingers = 5;
    const core = 5;
    const systemic = 5;
    const weighted = fingers * 0.45 + systemic * 0.45 + core * 0.1;
    const expected = Math.round(60 * Math.pow(weighted, 1.2));
    expect(calculateLoadFactor(undefined, fingers, core, systemic)).toBe(expected);
  });

  it("does not return NaN for a full range of fatigue inputs", () => {
    for (let v = 1; v <= 10; v++) {
      const result = calculateLoadFactor(60, v, v, v);
      expect(result).not.toBeNaN();
    }
  });
});

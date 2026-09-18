import { describe, it, expect } from "vitest";
import type {
  AnalyticsCategory,
  Benchmark,
  CompetitionEvent,
  DailyMetricEntry,
  ExerciseTypeDef,
  OutdoorAscent,
  PainLog,
  PhaseDef,
  TrainingBlock,
  Workout,
} from "../types";
import type { AISharingPreferences } from "../preferences/migrate";
import {
  buildExerciseModalities,
  buildAnalyticsCategorySummaries,
  buildRecentWorkouts,
  buildWorkoutsInWeeks,
  buildBenchmarksInWeeks,
  buildTrainingBlockContext,
  buildCompetitionContext,
  buildReadinessSnapshot,
  buildPainLogContext,
  buildOutdoorAscentContext,
  buildAIContextProfile,
  type AIContextSource,
} from "./context";

const asOf = new Date("2026-09-18T12:00:00.000Z");

const exerciseTypes: ExerciseTypeDef[] = [
  { id: "et-1", name: "Hangboard", category: "Fingers", parameters: ["duration", "sets"] },
  { id: "et-2", name: "Old Move", category: "Other", parameters: [], archived: true },
];

const analyticsCategories: AnalyticsCategory[] = [
  { id: "cat-1", name: "Fingers", color: "red" },
  { id: "cat-2", name: "Old Cat", color: "gray", archived: true },
];

const phaseDefs: PhaseDef[] = [
  { id: "phase-1", name: "Capacity" },
  { id: "phase-2", name: "Retired Phase", archived: true },
];

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return {
    id: "w-" + Math.random(),
    status: "planned",
    date: null,
    weekId: "2026-W25",
    loadFactor: 0,
    exercises: [],
    ...overrides,
  };
}

describe("buildExerciseModalities", () => {
  it("excludes archived types", () => {
    const result = buildExerciseModalities(exerciseTypes);
    expect(result).toEqual([{ name: "Hangboard", category: "Fingers", params: ["duration", "sets"] }]);
  });
});

describe("buildAnalyticsCategorySummaries", () => {
  it("excludes archived categories", () => {
    expect(buildAnalyticsCategorySummaries(analyticsCategories)).toEqual([{ name: "Fingers" }]);
  });
});

describe("buildRecentWorkouts", () => {
  it("caps at the given limit, taking the most recent (end of array)", () => {
    const workouts = Array.from({ length: 25 }, (_, i) => makeWorkout({ id: `w${i}`, weekId: `2026-W${i}` }));
    const result = buildRecentWorkouts(workouts, exerciseTypes, 20);
    expect(result).toHaveLength(20);
    expect(result[0].weekId).toBe("2026-W5");
    expect(result[19].weekId).toBe("2026-W24");
  });

  it("includes loadFactor/fatigue only for completed workouts", () => {
    const planned = makeWorkout({ status: "planned", loadFactor: 999 });
    const completed = makeWorkout({ status: "completed", date: "2026-09-01", loadFactor: 42, fingers: 5, arms: 3, core: 4, systemic: 6 });
    const result = buildRecentWorkouts([planned, completed], exerciseTypes);
    expect(result[0].loadFactor).toBeUndefined();
    expect(result[1].loadFactor).toBe(42);
    expect(result[1]).toMatchObject({ fingers: 5, arms: 3, core: 4, systemic: 6 });
  });

  it("resolves exercise names via typeId, falling back to Unknown", () => {
    const w = makeWorkout({
      exercises: [
        { id: "s1", typeId: "et-1", prescribed: { duration: 30, sets: 5 } },
        { id: "s2", typeId: "missing", prescribed: {} },
      ],
    });
    const result = buildRecentWorkouts([w], exerciseTypes);
    expect(result[0].exercises).toEqual([
      { name: "Hangboard", duration: 30, sets: 5, reps: undefined, plannedLoad: undefined },
      { name: "Unknown", duration: undefined, sets: undefined, reps: undefined, plannedLoad: undefined },
    ]);
  });
});

describe("buildWorkoutsInWeeks", () => {
  it("keeps only completed workouts within the given weekIds", () => {
    const inRangeCompleted = makeWorkout({ id: "a", weekId: "2026-W25", status: "completed", date: "2026-06-20" });
    const inRangePlanned = makeWorkout({ id: "b", weekId: "2026-W25", status: "planned" });
    const outOfRange = makeWorkout({ id: "c", weekId: "2026-W30", status: "completed", date: "2026-07-25" });
    const result = buildWorkoutsInWeeks([inRangeCompleted, inRangePlanned, outOfRange], exerciseTypes, ["2026-W25"]);
    expect(result).toHaveLength(1);
    expect(result[0].weekId).toBe("2026-W25");
  });
});

describe("buildBenchmarksInWeeks", () => {
  it("filters by weekId membership", () => {
    const benchmarks: Benchmark[] = [
      { id: "b1", typeId: "t1", type: "Max Hang", value: 10, unit: "kg", date: "2026-06-20", weekId: "2026-W25" },
      { id: "b2", typeId: "t1", type: "Max Hang", value: 12, unit: "kg", date: "2026-07-25", weekId: "2026-W30" },
    ];
    expect(buildBenchmarksInWeeks(benchmarks, ["2026-W25"])).toEqual([benchmarks[0]]);
  });
});

describe("buildTrainingBlockContext", () => {
  const blocks: TrainingBlock[] = [
    { id: "b1", name: "Capacity Block", phaseId: "phase-1", startWeekId: "2026-W20", endWeekId: "2026-W22" },
    { id: "b2", name: "Near Block", phaseId: "phase-1", startWeekId: "2026-W30", endWeekId: "2026-W32" },
    { id: "b3", name: "Far Block", phaseId: "phase-1", startWeekId: "2026-W40", endWeekId: "2026-W42" },
  ];

  it("returns an empty list for an empty weekIds window", () => {
    expect(buildTrainingBlockContext(blocks, phaseDefs, [])).toEqual([]);
  });

  it("includes blocks directly covering the window", () => {
    const result = buildTrainingBlockContext(blocks, phaseDefs, ["2026-W21"]);
    expect(result.map((b) => b.name)).toContain("Capacity Block");
  });

  it("includes a block near (within the margin of) the window but excludes one that's too far", () => {
    const result = buildTrainingBlockContext(blocks, phaseDefs, ["2026-W25", "2026-W26"]);
    const names = result.map((b) => b.name);
    expect(names).toContain("Near Block");
    expect(names).not.toContain("Far Block");
  });

  it("resolves phaseName via phaseDefs", () => {
    const result = buildTrainingBlockContext(blocks, phaseDefs, ["2026-W21"]);
    expect(result[0].phaseName).toBe("Capacity");
  });
});

describe("buildCompetitionContext", () => {
  it("excludes past events and sorts soonest-first", () => {
    const events: CompetitionEvent[] = [
      { id: "e1", name: "Past Comp", date: "2026-01-01", priority: "B" },
      { id: "e2", name: "Later Comp", date: "2026-12-01", priority: "B" },
      { id: "e3", name: "Sooner Comp", date: "2026-10-01", priority: "C" },
    ];
    const result = buildCompetitionContext(events, asOf);
    expect(result.map((e) => e.name)).toEqual(["Sooner Comp", "Later Comp"]);
    expect(result[0].daysAway).toBeGreaterThan(0);
  });

  it("keeps an A-priority event even beyond the cap", () => {
    const events: CompetitionEvent[] = Array.from({ length: 5 }, (_, i) => ({
      id: `filler${i}`,
      name: `Filler ${i}`,
      date: `2026-10-0${i + 1}`,
      priority: "C" as const,
    }));
    events.push({ id: "important", name: "Nationals", date: "2027-01-01", priority: "A" });
    const result = buildCompetitionContext(events, asOf, 5);
    expect(result.map((e) => e.name)).toContain("Nationals");
  });
});

describe("buildReadinessSnapshot", () => {
  it("returns a neutral status with no inputs at all", () => {
    const result = buildReadinessSnapshot([], [], asOf);
    expect(result.score).toBeUndefined();
    expect(result.status).toBe("neutral");
  });

  it("produces trends scoped to the trailing 14 days", () => {
    const dailyMetrics: DailyMetricEntry[] = [
      { id: "m1", metricId: "hrv", date: "2026-09-17", value: 60 },
      { id: "m2", metricId: "hrv", date: "2026-08-01", value: 55 }, // too old
    ];
    const result = buildReadinessSnapshot([], dailyMetrics, asOf);
    expect(result.hrvTrend).toEqual([{ date: "2026-09-17", value: 60 }]);
  });
});

describe("buildPainLogContext", () => {
  it("sorts newest first and caps at the limit", () => {
    const logs: PainLog[] = [
      { id: "p1", date: "2026-01-01", weekId: "2026-W01", bodyPart: "Elbow", severity: 3 },
      { id: "p2", date: "2026-06-01", weekId: "2026-W22", bodyPart: "Finger", severity: 6 },
    ];
    const result = buildPainLogContext(logs, 1);
    expect(result).toEqual([{ date: "2026-06-01", bodyPart: "Finger", severity: 6, notes: undefined }]);
  });
});

describe("buildOutdoorAscentContext", () => {
  it("sorts newest first", () => {
    const ascents: OutdoorAscent[] = [
      { id: "a1", date: "2026-01-01", grade: "7a" },
      { id: "a2", date: "2026-06-01", grade: "7b" },
    ];
    const result = buildOutdoorAscentContext(ascents);
    expect(result[0].grade).toBe("7b");
  });
});

describe("buildAIContextProfile", () => {
  const allSharingOn: AISharingPreferences = {
    trainingBlocks: true,
    competitions: true,
    readinessMetrics: true,
    painLogs: true,
    outdoorAscents: true,
  };
  const allSharingOff: AISharingPreferences = {
    trainingBlocks: false,
    competitions: false,
    readinessMetrics: false,
    painLogs: false,
    outdoorAscents: false,
  };

  const source: AIContextSource = {
    exerciseTypes,
    analyticsCategories,
    phaseDefs,
    workouts: [makeWorkout({ status: "completed", date: "2026-09-01", weekId: "2026-W25" })],
    benchmarks: [{ id: "b1", typeId: "t1", type: "Max Hang", value: 10, unit: "kg", date: "2026-06-20", weekId: "2026-W25" }],
    trainingBlocks: [{ id: "tb1", name: "Block", phaseId: "phase-1", startWeekId: "2026-W25", endWeekId: "2026-W25" }],
    competitionEvents: [{ id: "e1", name: "Comp", date: "2026-12-01", priority: "A" }],
    dailyMetrics: [{ id: "m1", metricId: "hrv", date: "2026-09-17", value: 60 }],
    painLogs: [{ id: "p1", date: "2026-09-01", weekId: "2026-W25", bodyPart: "Finger", severity: 4 }],
    outdoorAscents: [{ id: "a1", date: "2026-09-01", grade: "7a" }],
  };

  it("includes the exercise/phase catalog for generate and context modes", () => {
    expect(buildAIContextProfile("generate", source, allSharingOff, asOf, ["2026-W25"]).exerciseModalities).toBeDefined();
    expect(buildAIContextProfile("context", source, allSharingOff, asOf).exerciseModalities).toBeDefined();
  });

  it("omits the exercise/phase catalog for analyze mode", () => {
    const profile = buildAIContextProfile("analyze", source, allSharingOff, asOf, ["2026-W25"]);
    expect(profile.exerciseModalities).toBeUndefined();
    expect(profile.analyticsCategories).toBeUndefined();
    expect(profile.phases).toBeUndefined();
  });

  it("omits every sharing-gated section when every toggle is off", () => {
    const profile = buildAIContextProfile("generate", source, allSharingOff, asOf, ["2026-W25"]);
    expect(profile.trainingBlocks).toBeUndefined();
    expect(profile.competitions).toBeUndefined();
    expect(profile.readiness).toBeUndefined();
    expect(profile.painLogs).toBeUndefined();
    expect(profile.outdoorAscents).toBeUndefined();
  });

  it("includes every sharing-gated section when every toggle is on", () => {
    const profile = buildAIContextProfile("generate", source, allSharingOn, asOf, ["2026-W25"]);
    expect(profile.trainingBlocks).toBeDefined();
    expect(profile.competitions).toBeDefined();
    expect(profile.readiness).toBeDefined();
    expect(profile.painLogs).toBeDefined();
    expect(profile.outdoorAscents).toBeDefined();
  });

  it("windows training blocks/competitions around the current week for context mode (no target range)", () => {
    const profile = buildAIContextProfile("context", source, allSharingOn, asOf);
    // The fixture block covers 2026-W25, well before asOf's week (2026-W38) -
    // out of a "current week" window, so it should not appear.
    expect(profile.trainingBlocks).toEqual([]);
  });

  it("scopes recentWorkouts/benchmarks to the target range for analyze, but not generate/context", () => {
    const analyzeProfile = buildAIContextProfile("analyze", source, allSharingOff, asOf, ["2026-W25"]);
    expect(analyzeProfile.recentWorkouts).toHaveLength(1);
    expect(analyzeProfile.benchmarks).toHaveLength(1);

    const outOfRangeProfile = buildAIContextProfile("analyze", source, allSharingOff, asOf, ["2026-W01"]);
    expect(outOfRangeProfile.recentWorkouts).toHaveLength(0);
    expect(outOfRangeProfile.benchmarks).toHaveLength(0);
  });
});

import type {
  AnalyticsCategory,
  Benchmark,
  CompetitionEvent,
  DailyMetricEntry,
  ExerciseTypeDef,
  OutdoorAscent,
  PainLog,
  ParameterBlock,
  PhaseDef,
  TrainingBlock,
  Workout,
} from "../types";
import { slotTypeName, slotValues } from "../exerciseSlot";
import { getWeekId, decrementWeekId, incrementWeekId, toUtcDayIndex } from "../dateUtils";
import { BODYWEIGHT_METRIC_ID } from "../constants";
import {
  computeFatigueDecay,
  computeHrvBaseline,
  computeReadiness,
  type ReadinessStatus,
} from "../analytics/readiness";
import { calculateRollingAcwr } from "../analytics/loadAnalytics";
import type { AISharingPreferences } from "../preferences/migrate";

/**
 * Builds the condensed training-profile data embedded in every AI prompt
 * (`AIPromptModal.svelte`, "Generate Plan"/"Analyze Past"/"Context Only").
 * Extracted out of the component per UI_PLAN.md §5.8/Stage 10 - pure and
 * independently testable, matching this project's standing "pure
 * data-shaping logic gets tests" convention (PLAN.md's own `loadAnalytics.ts`
 * precedent).
 *
 * Before this stage, the prompts predated Phase 4/6/7 entirely: they sent
 * exercise type names + default parameters, the last 20 workouts reduced to
 * `{date, status, exercise names}` (no duration/sets/reps/load/fatigue), and
 * phase names + benchmarks. Nothing from `TrainingBlock`s, competitions,
 * readiness/daily metrics, pain logs, or outdoor ascents ever reached the
 * AI. This module fills every one of those gaps, gated by two independent
 * axes:
 *
 * - **Mode** (`AIPromptMode`) - "Analyze Past" already scopes itself to a
 *   user-picked week range and doesn't need the full exercise/phase catalog
 *   (it evaluates what *did* happen, not what modalities exist to plan
 *   with) - see `buildAIContextProfile`'s `includeCatalog` branch.
 * - **Sharing preference** (`AISharingPreferences`, `src/lib/preferences/
 *   migrate.ts`) - training-blocks/competitions/readiness-metrics/pain-logs/
 *   outdoor-ascents are each independently opt-in/opt-out, a genuinely
 *   separate privacy decision from "does the AI have enough context" (health-
 *   adjacent data like sleep/HRV/pain logs especially). A disabled category
 *   is simply omitted from the built profile - never sent-but-redacted.
 */

const RECENT_WORKOUTS_LIMIT = 20;
const BLOCK_WINDOW_MARGIN_WEEKS = 4;
const COMPETITION_LOOKAHEAD_LIMIT = 5;
const PAIN_LOG_LIMIT = 10;
const OUTDOOR_ASCENT_LIMIT = 20;
const METRIC_TREND_DAYS = 14;

export type AIPromptMode = "generate" | "analyze" | "context";

// --- Exercise catalog / phases -------------------------------------------

export interface ExerciseModalitySummary {
  name: string;
  category: string;
  params: ParameterBlock[];
}

/** Archived types are excluded - nothing the AI should be offered as a modality to plan with, mirroring how the existing phase list already excludes archived phases. */
export function buildExerciseModalities(exerciseTypes: ExerciseTypeDef[]): ExerciseModalitySummary[] {
  return exerciseTypes
    .filter((t) => !t.archived)
    .map((t) => ({ name: t.name, category: t.category, params: t.parameters }));
}

export interface AnalyticsCategorySummary {
  name: string;
}

/** The list an AI-invented exercise type's optional `categoryName` (`schema.ts`) should be chosen from. */
export function buildAnalyticsCategorySummaries(categories: AnalyticsCategory[]): AnalyticsCategorySummary[] {
  return categories.filter((c) => !c.archived).map((c) => ({ name: c.name }));
}

// --- Workouts --------------------------------------------------------------

export interface RecentWorkoutExerciseSummary {
  name: string;
  duration?: number;
  sets?: number;
  reps?: number;
  plannedLoad?: number;
}

export interface RecentWorkoutSummary {
  date: string | null;
  status: Workout["status"];
  weekId: string;
  /** The session name (`Workout.notes` - see its own doc comment: "Used as the session name"). */
  name?: string;
  /** Actual calculated stress score - only meaningful once `status` is "completed". */
  loadFactor?: number;
  fingers?: number;
  arms?: number;
  core?: number;
  systemic?: number;
  exercises: RecentWorkoutExerciseSummary[];
}

function summarizeWorkout(w: Workout, exerciseTypes: ExerciseTypeDef[]): RecentWorkoutSummary {
  return {
    date: w.date,
    status: w.status,
    weekId: w.weekId,
    name: w.notes || undefined,
    loadFactor: w.status === "completed" ? w.loadFactor : undefined,
    fingers: w.fingers,
    arms: w.arms,
    core: w.core,
    systemic: w.systemic,
    exercises: w.exercises.map((e) => {
      const v = slotValues(e);
      return {
        name: slotTypeName(e, exerciseTypes),
        duration: v.duration,
        sets: v.sets,
        reps: v.reps,
        plannedLoad: v.plannedLoad,
      };
    }),
  };
}

/** The most recent `limit` workouts (any status), in the same array order `workouts` is already stored in - matches the pre-Stage-10 "Last 20" convention. */
export function buildRecentWorkouts(
  workouts: Workout[],
  exerciseTypes: ExerciseTypeDef[],
  limit = RECENT_WORKOUTS_LIMIT,
): RecentWorkoutSummary[] {
  return workouts.slice(-limit).map((w) => summarizeWorkout(w, exerciseTypes));
}

/** Completed workouts whose `weekId` falls in `weekIds` - "Analyze Past"'s own scoped window, full detail (not just names) per UI_PLAN.md §5.8. */
export function buildWorkoutsInWeeks(
  workouts: Workout[],
  exerciseTypes: ExerciseTypeDef[],
  weekIds: string[],
): RecentWorkoutSummary[] {
  const targetSet = new Set(weekIds);
  return workouts
    .filter((w) => w.status === "completed" && w.weekId && targetSet.has(w.weekId))
    .map((w) => summarizeWorkout(w, exerciseTypes));
}

/** Benchmarks recorded within `weekIds` - "Analyze Past"'s own scoped window. */
export function buildBenchmarksInWeeks(benchmarks: Benchmark[], weekIds: string[]): Benchmark[] {
  const targetSet = new Set(weekIds);
  return benchmarks.filter((b) => b.weekId && targetSet.has(b.weekId));
}

// --- Training blocks ---------------------------------------------------

export interface TrainingBlockSummary {
  name: string;
  phaseName: string;
  startWeekId: string;
  endWeekId: string;
}

/**
 * `TrainingBlock`s covering `weekIds`, or within `BLOCK_WINDOW_MARGIN_WEEKS`
 * weeks either side of it - "covering or near the target weeks" per
 * UI_PLAN.md §5.8 item 1, so a block that's about to end or about to start
 * still gives the AI useful context even without literally overlapping.
 * Returns `[]` for an empty `weekIds` (nothing to window around).
 */
export function buildTrainingBlockContext(
  blocks: TrainingBlock[],
  phaseDefs: PhaseDef[],
  weekIds: string[],
): TrainingBlockSummary[] {
  if (weekIds.length === 0) return [];
  const sorted = [...weekIds].sort();
  let windowStart = sorted[0];
  let windowEnd = sorted[sorted.length - 1];
  for (let i = 0; i < BLOCK_WINDOW_MARGIN_WEEKS; i++) {
    windowStart = decrementWeekId(windowStart);
    windowEnd = incrementWeekId(windowEnd);
  }
  const phaseName = (phaseId: string) => phaseDefs.find((p) => p.id === phaseId)?.name ?? "Unknown";
  return blocks
    .filter((b) => b.startWeekId <= windowEnd && windowStart <= b.endWeekId)
    .map((b) => ({ name: b.name, phaseName: phaseName(b.phaseId), startWeekId: b.startWeekId, endWeekId: b.endWeekId }))
    .sort((a, b) => (a.startWeekId < b.startWeekId ? -1 : a.startWeekId > b.startWeekId ? 1 : 0));
}

// --- Competitions --------------------------------------------------------

export interface CompetitionSummary {
  name: string;
  date: string;
  priority: CompetitionEvent["priority"];
  daysAway: number;
}

/**
 * Upcoming events (date >= `asOf`'s calendar day), soonest first, capped at
 * `limit` - except an A-priority event that would otherwise fall outside the
 * cap is kept anyway ("A-priority especially - a coaching prompt should know
 * what the athlete is peaking for", UI_PLAN.md §5.8 item 1).
 */
export function buildCompetitionContext(
  events: CompetitionEvent[],
  asOf: Date,
  limit = COMPETITION_LOOKAHEAD_LIMIT,
): CompetitionSummary[] {
  const asOfDay = toUtcDayIndex(asOf.toISOString());
  const upcoming = events
    .filter((e) => toUtcDayIndex(e.date) >= asOfDay)
    .map((e) => ({ name: e.name, date: e.date, priority: e.priority, daysAway: toUtcDayIndex(e.date) - asOfDay }))
    .sort((a, b) => a.daysAway - b.daysAway);
  if (upcoming.length <= limit) return upcoming;
  const kept = upcoming.slice(0, limit);
  const droppedAPriority = upcoming.slice(limit).filter((e) => e.priority === "A");
  return [...kept, ...droppedAPriority].sort((a, b) => a.daysAway - b.daysAway);
}

// --- Readiness / daily metrics --------------------------------------------

export interface MetricTrendPoint {
  date: string;
  value: number;
}

export interface ReadinessSnapshot {
  score?: number;
  status: ReadinessStatus;
  confidence: string;
  advice: string;
  sleepTrend: MetricTrendPoint[];
  hrvTrend: MetricTrendPoint[];
  rhrTrend: MetricTrendPoint[];
  bodyweightTrend: MetricTrendPoint[];
}

function trendFor(
  dailyMetrics: DailyMetricEntry[],
  metricId: string,
  asOf: Date,
  days = METRIC_TREND_DAYS,
): MetricTrendPoint[] {
  const asOfDay = toUtcDayIndex(asOf.toISOString());
  return dailyMetrics
    .filter((m) => m.metricId === metricId)
    .filter((m) => {
      const day = toUtcDayIndex(m.date);
      return day <= asOfDay && asOfDay - day < days;
    })
    .map((m) => ({ date: m.date, value: m.value }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * The same readiness computation Home's hero renders (`computeReadiness`,
 * one source of truth - see `readiness.ts`'s own doc comment), plus trailing
 * 14-day sleep/HRV/RHR/bodyweight trends so the AI can see direction, not
 * just a single snapshot value.
 */
export function buildReadinessSnapshot(workouts: Workout[], dailyMetrics: DailyMetricEntry[], asOf: Date): ReadinessSnapshot {
  const todayIso = asOf.toISOString().split("T")[0];
  const fatigueDecay = computeFatigueDecay(workouts, asOf);
  const acwr = calculateRollingAcwr(workouts, asOf);
  const hrvBaseline = computeHrvBaseline(dailyMetrics, asOf);
  const todaysMetric = (metricId: string): number | undefined =>
    dailyMetrics.find((m) => m.metricId === metricId && m.date === todayIso)?.value;
  const readiness = computeReadiness({
    fatigue: { fingers: fatigueDecay.fingers, core: fatigueDecay.core, systemic: fatigueDecay.systemic },
    acwr,
    sleep: todaysMetric("sleep-score"),
    hrv: todaysMetric("hrv"),
    hrvBaseline,
  });
  return {
    score: readiness.score,
    status: readiness.status,
    confidence: readiness.confidence,
    advice: readiness.advice,
    sleepTrend: trendFor(dailyMetrics, "sleep-score", asOf),
    hrvTrend: trendFor(dailyMetrics, "hrv", asOf),
    rhrTrend: trendFor(dailyMetrics, "rhr", asOf),
    bodyweightTrend: trendFor(dailyMetrics, BODYWEIGHT_METRIC_ID, asOf),
  };
}

// --- Pain logs / outdoor ascents ------------------------------------------

export interface PainLogSummary {
  date: string;
  bodyPart: string;
  severity: number;
  notes?: string;
}

/** Most recent `limit` pain logs, newest first. */
export function buildPainLogContext(painLogs: PainLog[], limit = PAIN_LOG_LIMIT): PainLogSummary[] {
  return [...painLogs]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map((p) => ({ date: p.date, bodyPart: p.bodyPart, severity: p.severity, notes: p.notes }));
}

export interface OutdoorAscentSummary {
  date: string;
  grade: string;
  style?: string;
  crag?: string;
}

/** Most recent `limit` outdoor ascents, newest first - a grade-history snapshot, not the full log. */
export function buildOutdoorAscentContext(ascents: OutdoorAscent[], limit = OUTDOOR_ASCENT_LIMIT): OutdoorAscentSummary[] {
  return [...ascents]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, limit)
    .map((a) => ({ date: a.date, grade: a.grade, style: a.style, crag: a.crag }));
}

// --- Orchestrator ----------------------------------------------------------

export interface AIContextSource {
  exerciseTypes: ExerciseTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  phaseDefs: PhaseDef[];
  workouts: Workout[];
  benchmarks: Benchmark[];
  trainingBlocks: TrainingBlock[];
  competitionEvents: CompetitionEvent[];
  dailyMetrics: DailyMetricEntry[];
  painLogs: PainLog[];
  outdoorAscents: OutdoorAscent[];
}

export interface AIContextProfile {
  exerciseModalities?: ExerciseModalitySummary[];
  analyticsCategories?: AnalyticsCategorySummary[];
  phases?: string[];
  recentWorkouts: RecentWorkoutSummary[];
  benchmarks: Benchmark[];
  trainingBlocks?: TrainingBlockSummary[];
  competitions?: CompetitionSummary[];
  readiness?: ReadinessSnapshot;
  painLogs?: PainLogSummary[];
  outdoorAscents?: OutdoorAscentSummary[];
}

/**
 * Builds the full condensed profile for one AI prompt, gated by `mode` and
 * `sharing`. Pure - the caller (`AIPromptModal.svelte`) still owns the
 * surrounding prompt text (goal, framing, output instructions) and just
 * `JSON.stringify`s whichever fields of this profile it renders.
 *
 * `targetWeekIds` is the modal's own selected week range - required
 * (non-empty) for "generate"/"analyze" (both are always built from an
 * explicit range in the UI); omitted for "context", which has no range to
 * scope to, so training-block/competition windowing there uses the single
 * current week instead - the profile still surfaces the athlete's *current*
 * block/upcoming events rather than nothing.
 */
export function buildAIContextProfile(
  mode: AIPromptMode,
  source: AIContextSource,
  sharing: AISharingPreferences,
  asOf: Date,
  targetWeekIds: string[] = [],
): AIContextProfile {
  // "Analyze Past" already scopes itself to the picked week range and
  // doesn't need the full exercise/phase catalog (UI_PLAN.md §5.8 item 1).
  const includeCatalog = mode !== "analyze";

  const recentWorkouts =
    mode === "analyze"
      ? buildWorkoutsInWeeks(source.workouts, source.exerciseTypes, targetWeekIds)
      : buildRecentWorkouts(source.workouts, source.exerciseTypes);

  const benchmarks =
    mode === "analyze" ? buildBenchmarksInWeeks(source.benchmarks, targetWeekIds) : source.benchmarks;

  const windowWeekIds = mode === "context" ? [getWeekId(asOf)] : targetWeekIds;

  const profile: AIContextProfile = { recentWorkouts, benchmarks };

  if (includeCatalog) {
    profile.exerciseModalities = buildExerciseModalities(source.exerciseTypes);
    profile.analyticsCategories = buildAnalyticsCategorySummaries(source.analyticsCategories);
    profile.phases = source.phaseDefs.filter((p) => !p.archived).map((p) => p.name);
  }
  if (sharing.trainingBlocks) {
    profile.trainingBlocks = buildTrainingBlockContext(source.trainingBlocks, source.phaseDefs, windowWeekIds);
  }
  if (sharing.competitions) {
    profile.competitions = buildCompetitionContext(source.competitionEvents, asOf);
  }
  if (sharing.readinessMetrics) {
    profile.readiness = buildReadinessSnapshot(source.workouts, source.dailyMetrics, asOf);
  }
  if (sharing.painLogs) {
    profile.painLogs = buildPainLogContext(source.painLogs);
  }
  if (sharing.outdoorAscents) {
    profile.outdoorAscents = buildOutdoorAscentContext(source.outdoorAscents);
  }
  return profile;
}

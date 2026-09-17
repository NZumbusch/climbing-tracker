import type { ExerciseTypeDef, PhaseDef, WorkoutTemplate, ParameterBlock, AnalyticsCategory, BenchmarkTypeDef, MetricDef } from "./types";
import defaults from "../data/defaults.json";

/**
 * Current data model version for exports and migrations.
 */
export const DATA_EXPORT_VERSION = "3.26";

/**
 * Well-known `MetricDef.id` for bodyweight (Phase 6) - fixed/stable, same
 * treatment PLAN.md's Phase 1 asked for on `sleep-score`/`hrv`/`rhr` ("later
 * phases should treat these ids as fixed/well-known rather than
 * re-inventing them").
 */
export const BODYWEIGHT_METRIC_ID = "bodyweight";

/**
 * Built-in `MetricDef`s, used as `persistence.ts`'s fresh-install default.
 *
 * Bug fix (found 2026-09-17 while wiring bodyweight tracking): unlike every
 * other catalog (`templates`/`phaseDefs`/`exerciseTypes`/`benchmarkTypes`/
 * `analyticsCategories`, each defaulted from a `DEFAULT_*` constant in
 * `persistence.ts`), `metricDefs` had only ever defaulted to `[]` - the
 * built-in `sleep-score`/`hrv`/`rhr` ids were seeded *only* by the
 * `3.17->3.18` migration step. Combined with the post-Phase-3 fresh-install
 * fix (a true fresh install now skips the whole migration chain), a fresh
 * install got zero built-in `MetricDef`s. This constant is used only as
 * `persistence.ts`'s default for a fresh install - the historical
 * `3.17->3.18` migration step is left untouched (frozen, per Phase 0
 * discipline) for existing installs that go through it.
 */
export const DEFAULT_METRIC_DEFS: MetricDef[] = [
  { id: "sleep-score", name: "Sleep Score", unit: "pts" },
  { id: "hrv", name: "HRV", unit: "ms" },
  { id: "rhr", name: "Resting Heart Rate", unit: "bpm" },
  { id: BODYWEIGHT_METRIC_ID, name: "Bodyweight", unit: "kg" },
];

/**
 * Standard colors for training categories used in charts and indicators.
 */
export const DEFAULT_ANALYTICS_CATEGORIES: AnalyticsCategory[] = defaults.analyticsCategories;

/**
 * Exercise definitions incorporating new climbing styles and board parameters.
 */
export const DEFAULT_EXERCISE_TYPES: ExerciseTypeDef[] = defaults.exerciseTypes as ExerciseTypeDef[];

export const PARAMETER_LABELS: Record<ParameterBlock, string> = {
  duration: 'Duration',
  boulderingGrades: 'Bouldering Grades',
  routeGrades: 'Route Grades',
  grades: 'Grades',
  variant: 'Variant',
  cadence: 'Cadence',
  climbingStyle: 'Climbing Style',
  boardType: 'Board Type',
  boardAngle: 'Board Angle',
  sets: 'Sets',
  reps: 'Reps',
  holdType: 'Hold Type',
  timeOn: 'Time On',
  timeOff: 'Time Off',
  restTime: 'Rest Time',
  holdSize: 'Hold Size',
  weight: 'Weight',
  distance: 'Distance',
  campusStyle: 'Campus Style',
  mobilityType: 'Mobility Type',
  leadStyle: 'Lead Style',
  difficulty: 'Difficulty/RPE',
  routeDifficulty: 'Route Difficulty',
  bodyweightPercent: 'Bodyweight %',
  maxWeightPercent: 'Max Weight %',
  movesPerRoute: 'Moves per Route'
};

/**
 * Periodized workout templates optimized for high-level training, keyed by PhaseDef.id.
 */
export const DEFAULT_TEMPLATES: Record<string, WorkoutTemplate[]> = defaults.templates as unknown as Record<string, WorkoutTemplate[]>;

/**
 * The 7 built-in macrocycle phases (Phase 3 - see PhaseDef).
 */
export const DEFAULT_PHASE_DEFS: PhaseDef[] = defaults.phaseDefs as PhaseDef[];

/**
 * Default benchmark test types.
 */
export const DEFAULT_BENCHMARK_TYPES: BenchmarkTypeDef[] = defaults.benchmarkTypes as BenchmarkTypeDef[];

/**
 * A small library of selectable starter template sets, distinct from the
 * user's own customized `templates` (PLAN.md Phase 3). **Placeholder
 * content only** - seeded with one obviously-fake set (decided with the
 * user 2026-09-16) pending real training-science content; see PROGRESS.md.
 */
export interface TemplateLibrarySet {
  id: string;
  name: string;
  description?: string;
  templates: Record<string, WorkoutTemplate[]>;
}
export const DEFAULT_TEMPLATE_LIBRARY: TemplateLibrarySet[] = defaults.templateLibrary as unknown as TemplateLibrarySet[];

import type { ExerciseTypeDef, PhaseType, Workout, ParameterBlock, AnalyticsCategory, BenchmarkTypeDef } from "./types";
import defaults from "../data/defaults.json";

/**
 * Current data model version for exports and migrations.
 */
export const DATA_EXPORT_VERSION = "3.14";

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
 * Periodized workout templates optimized for high-level training.
 */
export const DEFAULT_TEMPLATES: Record<PhaseType, Partial<Workout>[]> = defaults.templates as unknown as Record<PhaseType, Partial<Workout>[]>;

/**
 * Default benchmark test types.
 */
export const DEFAULT_BENCHMARK_TYPES: BenchmarkTypeDef[] = defaults.benchmarkTypes as BenchmarkTypeDef[];

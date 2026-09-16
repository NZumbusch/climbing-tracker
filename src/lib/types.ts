/**
 * Valid navigation views within the application.
 */
export type ViewType = "plan" | "add" | "history" | "settings" | "analytics";

/**
 * High-level categorization of exercises for analytics and UI color-coding.
 */
export type ExerciseCategory = string; // Now a string referencing AnalyticsCategory.name

export interface AnalyticsCategory {
  id: string;
  name: string;
  color: string;
  archived?: boolean;
}

/**
 * Supported parameters that can be tracked for a specific exercise modality.
 */
export type ParameterBlock =
  | "duration"
  | "boulderingGrades"
  | "routeGrades"
  // "grades" is the 3.8->3.9 migration's merged target for the two above
  // (see storage.ts) - added here so PARAMETER_LABELS and migrated data
  // type-check. The old names stay too; existing UI still keys off them.
  | "grades"
  | "cadence"
  | "climbingStyle"
  | "boardType"
  | "boardAngle"
  | "variant"
  | "sets"
  | "reps"
  | "holdType"
  | "timeOn"
  | "timeOff"
  | "restTime"
  | "holdSize"
  | "weight"
  | "distance"
  | "campusStyle"
  | "difficulty"
  | "mobilityType"
  | "leadStyle"
  | "movesPerRoute"
  | "routeDifficulty"
  | "bodyweightPercent"
  | "maxWeightPercent";

/**
 * Defines a custom exercise modality, its tracking parameters, and defaults.
 */
export interface ExerciseTypeDef {
  id: string;
  name: string;
  category: ExerciseCategory;
  /** Parameters that are added by default when creating this exercise */
  parameters: ParameterBlock[];
  /** All parameters that make sense for this exercise (including defaults). If undefined, assumed equal to parameters. */
  possibleParameters?: ParameterBlock[];
  /** Expected stress scale (1-10) for a standard session of this type */
  defaultPlannedLoad?: number;
  /** Never hard-delete a type once referenced by history - archive it instead. */
  archived?: boolean;
}

/**
 * The tracked-parameter values for a single exercise instance - everything
 * about it except which exercise type it is and whether it's the plan or
 * the log (see `ExerciseSlot`). The whole set moves together: a field never
 * got individually split into "planned" vs "actual" here, so none of them
 * are split differently than any other by this interface.
 */
export interface ExerciseValues {
  notes?: string;
  duration?: number;
  /** The specific planned load (1-10) assigned for this instance */
  plannedLoad?: number;

  // Technique / Bouldering
  minGrade?: string;
  maxGrade?: string;
  cadence?: number; // min/boulder (or routes/hour)
  climbingStyle?: ("Slab" | "Coordination" | "Power" | "Board")[];
  boardType?: "Kilterboard" | "Moonboard" | "Tension Board" | "Spraywall";
  boardAngle?: number; // 20-70

  // Lead Climbing
  leadStyle?: ("Onsight" | "Flash" | "Redpoint" | "Projecting")[];

  // Non-Free / General
  sets?: number;
  reps?: number;
  movesPerRoute?: number;

  // Specific / Hangboard / Weights / Cardio
  holdType?:
    | "Crimp"
    | "Half Crimp"
    | "Full Crimp"
    | "Open Hand"
    | "Sloper"
    | "Pocket";
  timeOn?: number; // Time under tension per rep (seconds)
  timeOff?: number; // Rest between reps (seconds)
  timeBetweenSets?: number; // Rest between sets (seconds)
  weight?: number; // Added weight in kg
  holdSize?: number; // Hold depth in mm
  distance?: number; // Distance in km

  // Campus
  campusType?: "Jumps" | "One Arm Ladders";

  // Core / RPE
  difficulty?: number; // Perceived exertion 1-10
  routeDifficulty?: "Easy" | "Moderate" | "Hard";
  bodyweightPercent?: number; // % of bodyweight (e.g., 100% = bodyweight, 120% = BW + 20% weight)
  maxWeightPercent?: number; // % of 1RM or max weight

  // Mobility
  mobilityType?: ("Hamstrings" | "Shoulders" | "Hips" | "Spine" | "Ankles" | "Wrists")[];
}

/**
 * A single exercise "row" within a workout or template. References its
 * exercise type and (optional) category override by id, never by name -
 * renaming a type/category never requires touching any historical data.
 *
 * Separates the goal from the log: `prescribed` is set at plan time and
 * stays stable; `logged` is what actually happened, edited during/after
 * the session. Editing a workout after the fact no longer silently
 * overwrites the plan it should be compared against.
 */
export interface ExerciseSlot {
  id: string;
  /** -> ExerciseTypeDef.id */
  typeId: string;
  /** -> AnalyticsCategory.id. Overrides the type's default category. */
  categoryId?: string;
  /** Explicitly tracks which parameters are active for this specific instance */
  activeParameters?: ParameterBlock[];
  /** The goal, set at plan time, stable */
  prescribed?: ExerciseValues;
  /** What happened, edited during/after the session */
  logged?: ExerciseValues;
}

export type DayOfWeek =
  | "Monday"
  | "Tuesday"
  | "Wednesday"
  | "Thursday"
  | "Friday"
  | "Saturday"
  | "Sunday";

/**
 * Represents a full training session containing multiple exercises.
 */
export interface Workout {
  id: string;
  status: "planned" | "completed";
  /** ISO date string of completion, or null if planned */
  date: string | null;
  startTime?: string; // HH:mm format
  dayOfWeek?: DayOfWeek;
  notes?: string; // Used as the session name
  description?: string; // Extended notes/description for the session
  /** ISO-8601 Week ID (e.g. 2026-W25) linking this to the macrocycle */
  weekId: string;
  /** Actual calculated physiological stress score */
  loadFactor: number;
  /** Pre-calculated planned stress score based on scheduled exercises */
  plannedLoad?: number;
  exercises: ExerciseSlot[];

  // Fatigue Metrics (Perceived Exertion after completion)
  fingers?: number; // 1-10
  arms?: number; // 1-10
  core?: number; // 1-10
  systemic?: number; // 1-10
}

/**
 * Calculates the stress/load factor of a workout based on duration and RPE.
 */
export function calculateLoadFactor(
  duration: number | undefined, // in minutes
  fingers: number,
  core: number,
  systemic: number,
): number {
  // 1. Weighted Average: Emphasize the fatigue that dictates recovery time
  const weightedFatigue = fingers * 0.45 + systemic * 0.45 + core * 0.1;

  // 2. Exponential Scaling: Penalize high-intensity fatigue to make the graph realistic
  // Using a power of 1.2 or 1.3 ensures that 8s, 9s, and 10s spike your load graph.
  const intensityScale = Math.pow(weightedFatigue || 5, 1.2);

  // 3. Calculate and round to keep your database and charts clean
  // We use Number() to handle potential string inputs from range sliders or legacy data
  const d = duration !== undefined ? Number(duration) : 60;
  return Math.round(d * intensityScale);
}

/**
 * Calculates the planned load for an exercise based on its duration and planned intensity.
 *
 * Takes the exercise itself (not two positional numbers) because every real
 * call site already called it that way (`calculatePlannedLoad(exercise)`) -
 * the previous two-arg signature didn't match, so `duration` silently
 * received the whole exercise object and `Number(duration)` produced NaN.
 */
export function calculatePlannedLoad(exercise: {
  duration?: number;
  plannedLoad?: number;
}): number {
  // Ensure we have numbers. "0" || 5 in JS is "0", which is a common bug source.
  const d = exercise.duration !== undefined ? Number(exercise.duration) : 60;
  const i = exercise.plannedLoad !== undefined ? Number(exercise.plannedLoad) : 5;
  const intensityScale = Math.pow(i, 1.2);
  return Math.round(d * intensityScale);
}

/**
 * Defines a macrocycle training phase (e.g. Capacity, Deload). Data, not
 * code (Phase 3 principle 4) - replaces the old closed `PhaseType` union so
 * phases can be added/renamed/archived without shipping code.
 */
export interface PhaseDef {
  id: string;
  name: string;
  color?: string;
  /** For consistent display ordering */
  order?: number;
  /** Never hard-delete a phase once referenced by history - archive it instead. */
  archived?: boolean;
}

/**
 * Links a specific week to a macrocycle phase in the training plan.
 */
export interface PeriodizationWeek {
  weekId: string;
  /** -> PhaseDef.id */
  phaseId: string;
  /** Indicates if the user manually modified this week's plan from the default template */
  customized?: boolean;
}

/**
 * A default/prescribed workout belonging to a phase's template library.
 * Dedicated shape rather than `Partial<Workout>` - a template never had a
 * meaningful `status`/`date`/`loadFactor`/fatigue, so those workout-only
 * fields can no longer leak in by accident.
 */
export interface WorkoutTemplate {
  id: string;
  name?: string;
  dayOfWeek?: DayOfWeek;
  /** `logged` is always undefined on a template's slots - templates are pure plans. */
  exercises: ExerciseSlot[];
}

/**
 * Defines a type of benchmark test and its unit of measurement.
 */
export interface BenchmarkTypeDef {
  id: string;
  name: string;
  unit: string;
  archived?: boolean;
}

/**
 * A recorded instance of a benchmark test result.
 */
export interface Benchmark {
  id: string;
  /** References BenchmarkTypeDef.id */
  typeId: string;
  /** Keeping name for display/backwards compatibility during migrations */
  type: string;
  notes?: string;
  value: number;
  unit: string;
  date: string;
  weekId: string;
}

/**
 * Defines a type of daily metric that can be tracked (e.g. sleep score,
 * HRV, bodyweight). "What can be tracked" is data, not code - replaces the
 * old fixed-shape `DailyReadiness`.
 */
export interface MetricDef {
  id: string;
  name: string;
  unit: string;
  archived?: boolean;
}

/**
 * A single recorded value for a `MetricDef` on a given day.
 */
export interface DailyMetricEntry {
  id: string;
  /** -> MetricDef.id */
  metricId: string;
  /** YYYY-MM-DD */
  date: string;
  value: number;
  note?: string;
}

/**
 * A logged instance of pain/discomfort. Deliberately a dedicated entity
 * rather than folded into the generic `MetricDef`/`DailyMetricEntry`
 * system - pain tracking has its own shape (body part, severity, week
 * linkage) that doesn't fit a single numeric value per day.
 */
export interface PainLog {
  id: string;
  date: string;
  weekId: string;
  bodyPart: string;
  /** 1-10 */
  severity: number;
  notes?: string;
}

/**
 * The complete schema for all local user data.
 * Used for exporting and importing full database backups.
 */
export interface TrainingData {
  workouts: Workout[];
  periodization: PeriodizationWeek[];
  exerciseTypes: ExerciseTypeDef[];
  templates: Record<string, WorkoutTemplate[]>;
  phaseDefs: PhaseDef[];
  benchmarks: Benchmark[];
  benchmarkTypes: BenchmarkTypeDef[];
  analyticsCategories: AnalyticsCategory[];
  metricDefs: MetricDef[];
  dailyMetrics: DailyMetricEntry[];
  painLogs: PainLog[];
}

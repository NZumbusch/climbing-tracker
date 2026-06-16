/**
 * Represents the macrocycle phases of a climbing training plan.
 */
export type PhaseType =
  | "Work Capacity"
  | "Max Strength"
  | "Power"
  | "Power Endurance"
  | "Performance / Taper"
  | "Deload";

/**
 * Valid navigation views within the application.
 */
export type ViewType = "plan" | "add" | "history" | "settings" | "analytics";

/**
 * High-level categorization of exercises for analytics and UI color-coding.
 */
export type ExerciseCategory =
  | "Arms"
  | "Legs"
  | "Core"
  | "Technique Bouldering"
  | "Power Bouldering"
  | "Fingers"
  | "Other";

/**
 * Supported parameters that can be tracked for a specific exercise modality.
 */
export type ParameterBlock =
  | "duration"
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
  | "difficulty";

/**
 * Defines a custom exercise modality, its tracking parameters, and defaults.
 */
export interface ExerciseTypeDef {
  id: string;
  name: string;
  category: ExerciseCategory;
  /** Parameters that this exercise type uses in its form */
  parameters: ParameterBlock[];
  /** Expected stress scale (1-10) for a standard session of this type */
  defaultPlannedLoad?: number;
}

/**
 * Represents a single instance of an exercise within a workout.
 */
export interface Exercise {
  id: string;
  type: string;
  duration?: number;
  /** The specific planned load (1-10) assigned for this instance */
  plannedLoad?: number;

  // Technique / Bouldering
  minGrade?: string;
  maxGrade?: string;
  cadence?: number; // min/boulder
  climbingStyle?: "Slab" | "Coordination" | "Power" | "Board";
  boardType?: "Kilterboard" | "Moonboard" | "Tension Board" | "Spraywall";
  boardAngle?: number; // 20-70

  // Non-Free / General
  variant?: string; // 4x4, EMOM, etc.
  sets?: number;
  reps?: number;

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
  dayOfWeek?: DayOfWeek;
  /** ISO-8601 Week ID (e.g. 2026-W25) linking this to the macrocycle */
  weekId: string;
  notes: string;
  /** Actual calculated physiological stress score */
  loadFactor: number;
  /** Pre-calculated planned stress score based on scheduled exercises */
  plannedLoad?: number;
  exercises: Exercise[];

  // Fatigue Metrics (Perceived Exertion after completion)
  fingers?: number; // 1-10
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
 */
export function calculatePlannedLoad(
  duration: number | undefined,
  plannedIntensity: number | undefined,
): number {
  // Ensure we have numbers. "0" || 5 in JS is "0", which is a common bug source.
  const d = duration !== undefined ? Number(duration) : 60;
  const i = plannedIntensity !== undefined ? Number(plannedIntensity) : 5;
  const intensityScale = Math.pow(i, 1.2);
  return Math.round(d * intensityScale);
}

/**
 * Links a specific week to a macrocycle phase in the training plan.
 */
export interface PeriodizationWeek {
  weekId: string;
  phase: PhaseType;
  /** Indicates if the user manually modified this week's plan from the default template */
  customized?: boolean;
}

/**
 * Defines a type of benchmark test and its unit of measurement.
 */
export interface BenchmarkTypeDef {
  id: string;
  name: string;
  unit: string;
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
  value: number;
  unit: string;
  date: string;
  weekId: string;
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
  templates: Record<PhaseType, Partial<Workout>[]>;
  benchmarks: Benchmark[];
  benchmarkTypes: BenchmarkTypeDef[];
}

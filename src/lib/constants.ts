import type { ExerciseTypeDef, PhaseType, Workout, ParameterBlock } from "./types";

/**
 * Current data model version for exports and migrations.
 */
export const DATA_EXPORT_VERSION = "3.7";

/**
 * Standard colors for training categories used in charts and indicators.
 */
import type { AnalyticsCategory } from "./types";

export const DEFAULT_ANALYTICS_CATEGORIES: AnalyticsCategory[] = [
  { id: "cat-1", name: "Technique Bouldering", color: "bg-emerald-500" },
  { id: "cat-2", name: "Power Bouldering", color: "bg-purple-500" },
  { id: "cat-3", name: "Fingers", color: "bg-indigo-500" },
  { id: "cat-4", name: "Arms", color: "bg-rose-500" },
  { id: "cat-5", name: "Legs", color: "bg-amber-500" },
  { id: "cat-6", name: "Core", color: "bg-sky-500" },
  { id: "cat-7", name: "Other", color: "bg-zinc-500" },
];

/**
 * Exercise definitions incorporating new climbing styles and board parameters.
 */
export const DEFAULT_EXERCISE_TYPES: ExerciseTypeDef[] = [
  {
    id: "free-bouldering",
    name: "Free Bouldering",
    category: "Technique Bouldering",
    parameters: ["duration", "boulderingGrades", "climbingStyle"],
    possibleParameters: ["duration", "boulderingGrades", "cadence", "climbingStyle", "variant"],
    defaultPlannedLoad: 5,
  },
  {
    id: "board-session",
    name: "Board Session",
    category: "Power Bouldering",
    parameters: ["duration", "boulderingGrades", "boardType", "boardAngle"],
    possibleParameters: ["duration", "boulderingGrades", "boardType", "boardAngle", "variant"],
    defaultPlannedLoad: 8,
  },
  {
    id: "time-based-intervals",
    name: "Time-Based Intervals",
    category: "Power Bouldering",
    parameters: ["duration", "sets", "timeOn", "restTime", "routeDifficulty"],
    possibleParameters: ["duration", "sets", "timeOn", "timeOff", "restTime", "routeDifficulty"],
    defaultPlannedLoad: 7,
  },
  {
    id: "rep-based-intervals",
    name: "Rep-Based Intervals",
    category: "Power Bouldering",
    parameters: ["duration", "sets", "reps", "restTime", "routeDifficulty"],
    possibleParameters: ["duration", "sets", "reps", "restTime", "movesPerRoute", "routeDifficulty"],
    defaultPlannedLoad: 7,
  },
  {
    id: "max-hangs",
    name: "Max Hangs",
    category: "Fingers",
    parameters: ["holdType", "holdSize", "bodyweightPercent", "sets", "timeOn", "restTime"],
    possibleParameters: ["holdType", "holdSize", "bodyweightPercent", "maxWeightPercent", "weight", "sets", "reps", "timeOn", "timeOff", "restTime"],
    defaultPlannedLoad: 6,
  },
  {
    id: "weighted-pullups",
    name: "Weighted Pull-ups",
    category: "Arms",
    parameters: ["weight", "sets", "reps"],
    possibleParameters: ["weight", "bodyweightPercent", "maxWeightPercent", "sets", "reps", "difficulty"],
    defaultPlannedLoad: 5,
  },
  {
    id: "campus-board",
    name: "Campus Board",
    category: "Power Bouldering",
    parameters: ["duration", "campusStyle", "sets", "reps"],
    possibleParameters: ["duration", "campusStyle", "sets", "reps", "timeOn", "timeOff", "restTime"],
    defaultPlannedLoad: 9,
  },
  {
    id: "core-training",
    name: "Core Training",
    category: "Core",
    parameters: ["duration"],
    possibleParameters: ["duration", "difficulty"],
    defaultPlannedLoad: 4,
  },
  {
    id: "running",
    name: "Running",
    category: "Other",
    parameters: ["duration", "distance"],
    possibleParameters: ["duration", "distance"],
    defaultPlannedLoad: 4,
  },
  {
    id: "mobility",
    name: "Mobility",
    category: "Other",
    parameters: ["duration", "mobilityType"],
    possibleParameters: ["duration", "mobilityType"],
    defaultPlannedLoad: 2,
  },
  {
    id: "lead-climbing",
    name: "Lead Climbing",
    category: "Power Endurance",
    parameters: ["duration", "routeGrades", "leadStyle"],
    possibleParameters: ["duration", "routeGrades", "cadence", "leadStyle"],
    defaultPlannedLoad: 7,
  },
];

export const PARAMETER_LABELS: Record<ParameterBlock, string> = {
  duration: 'Duration',
  boulderingGrades: 'Bouldering Grades',
  routeGrades: 'Route Grades',
  cadence: 'Cadence',
  climbingStyle: 'Climbing Style',
  boardType: 'Board Type',
  boardAngle: 'Board Angle',
  variant: 'Variant',
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
export const DEFAULT_TEMPLATES: Record<PhaseType, Partial<Workout>[]> = {
  "Work Capacity": [
    {
      notes: "Volume Day: Focus on perfect technique below flash level.",
      dayOfWeek: "Monday",
      exercises: [
        { id: "1", type: "Free Bouldering", duration: 120, climbingStyle: ["Slab"], cadence: 10, plannedLoad: 5 },
        { id: "2", type: "Core Training", duration: 30, difficulty: 6, plannedLoad: 4 },
      ],
    },
    {
      notes: "Pulling Capacity & Capacity Bouldering",
      dayOfWeek: "Wednesday",
      exercises: [
        { id: "3", type: "Free Bouldering", duration: 90, climbingStyle: ["Power"], plannedLoad: 6 },
        { id: "4", type: "Weighted Pull-ups", weight: 10, sets: 4, plannedLoad: 5 },
      ],
    },
  ],
  "Max Strength": [
    {
      notes: "Limit Bouldering & Max Hangs",
      dayOfWeek: "Tuesday",
      exercises: [
        { id: "1", type: "Free Bouldering", duration: 90, climbingStyle: ["Power"], plannedLoad: 8 },
        { id: "2", type: "Max Hangs", holdType: "Half Crimp", holdSize: 20, bodyweightPercent: 125, sets: 5, plannedLoad: 6 },
      ],
    },
    {
      notes: "Heavy Board Session",
      dayOfWeek: "Thursday",
      exercises: [
        { id: "3", type: "Board Session", duration: 90, boardType: "Kilterboard", boardAngle: 45, plannedLoad: 9 },
        { id: "4", type: "Core Training", duration: 20, difficulty: 9, plannedLoad: 4 },
      ],
    },
  ],
  Power: [
    {
      notes: "Explosive Power Day",
      dayOfWeek: "Wednesday",
      exercises: [
        { id: "1", type: "Free Bouldering", duration: 90, climbingStyle: ["Coordination"], plannedLoad: 7 },
        { id: "2", type: "Campus Board", duration: 20, campusType: "Jumps", plannedLoad: 9 },
      ],
    },
    {
      notes: "Board Power",
      dayOfWeek: "Friday",
      exercises: [
        { id: "3", type: "Board Session", duration: 120, boardType: "Moonboard", boardAngle: 40, plannedLoad: 9 },
        { id: "4", type: "Weighted Pull-ups", weight: 30, sets: 3, plannedLoad: 6 },
      ],
    },
  ],
  "Power Endurance": [
    {
      notes: "Lactic Tolerance",
      dayOfWeek: "Tuesday",
      exercises: [
        { id: "1", type: "Rep-Based Intervals", reps: 4, sets: 4, duration: 60, plannedLoad: 8 },
        { id: "2", type: "Core Training", duration: 25, difficulty: 8, plannedLoad: 4 },
      ],
    },
  ],
  "Performance / Taper": [
    {
      notes: "Projecting Day",
      dayOfWeek: "Saturday",
      exercises: [
        { id: "1", type: "Free Bouldering", duration: 120, climbingStyle: ["Board"], plannedLoad: 9 },
      ],
    },
    {
      notes: "Active Recovery",
      dayOfWeek: "Thursday",
      exercises: [
        { id: "2", type: "Free Bouldering", duration: 60, climbingStyle: ["Slab"], plannedLoad: 3 },
      ],
    },
  ],
  "Deload": [
    {
      notes: "Light Activation Session",
      dayOfWeek: "Tuesday",
      exercises: [
        { id: "1", type: "Free Bouldering", duration: 60, climbingStyle: ["Slab"], cadence: 6, plannedLoad: 2 },
      ],
    },
    {
      notes: "Light Activation Session",
      dayOfWeek: "Thursday",
      exercises: [
        { id: "2", type: "Free Bouldering", duration: 60, climbingStyle: ["Power"], cadence: 4, plannedLoad: 2 },
      ],
    }
  ]
};

/**
 * Default benchmark test types.
 */
export const DEFAULT_BENCHMARK_TYPES = [
  { id: "max-hang-20", name: "Max Hang 20mm", unit: "kg" },
  { id: "max-hang-15", name: "Max Hang 15mm", unit: "kg" },
  { id: "max-hang-10", name: "Max Hang 10mm", unit: "kg" },
  { id: "1rm-weighted-pullup", name: "1RM Weighted Pullup", unit: "kg" },
  { id: "1rm-weighted-dip", name: "1RM Weighted Dip", unit: "kg" },
  { id: "max-pullups", name: "Max Pullups", unit: "reps" },
  { id: "lsit-duration", name: "L-Sit Duration", unit: "s" },
  { id: "front-lever-duration", name: "Front Lever Duration", unit: "s" },
];

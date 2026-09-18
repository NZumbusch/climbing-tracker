import type { DayOfWeek, ExerciseValues } from "../types";

/**
 * Runtime validators for the two AI JSON contracts (Phase 5 - see PLAN.md).
 * Hand-rolled rather than a schema library (zod etc.), per PLAN.md's stated
 * default. Untrusted/unpredictable input (pasted from an LLM, which "doesn't
 * reliably follow strict JSON contracts" per PLAN.md's own DoD) - never
 * partially trust it. Validation here is deliberately **all-or-nothing**:
 * if any required field is missing or has the wrong type anywhere in the
 * document, the whole parse is rejected (`valid: false`, no `data`) rather
 * than silently importing the well-formed parts. This is what makes "never
 * silently commit anything on invalid input" trivially true at the
 * validation layer - the caller (AIImportModal) only ever sees a `data`
 * object once every check below has passed.
 *
 * Deliberately permissive in one direction: unrecognized object keys
 * (top-level, per-week, per-workout, per-exercise, or inside `values`) are
 * silently ignored rather than rejected. LLMs commonly add extra
 * commentary/rationale fields even when told not to; rejecting on those
 * would make the feature unusably brittle for no safety benefit (an unknown
 * key can't corrupt stored data - it's simply never read).
 */

const DAYS_OF_WEEK: DayOfWeek[] = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

type FieldType = "number" | "string" | "string[]";

/** Every `ExerciseValues` field an AI import may set, and how to validate it. */
const EXERCISE_VALUE_FIELDS: Record<keyof ExerciseValues, FieldType> = {
  notes: "string",
  duration: "number",
  plannedLoad: "number",
  minGrade: "string",
  maxGrade: "string",
  cadence: "number",
  climbingStyle: "string[]",
  boardType: "string",
  boardAngle: "number",
  leadStyle: "string[]",
  sets: "number",
  reps: "number",
  movesPerRoute: "number",
  holdType: "string",
  timeOn: "number",
  timeOff: "number",
  timeBetweenSets: "number",
  weight: "number",
  holdSize: "number",
  distance: "number",
  campusType: "string",
  difficulty: "number",
  routeDifficulty: "string",
  bodyweightPercent: "number",
  maxWeightPercent: "number",
  mobilityType: "string[]",
};

export interface ValidationIssue {
  /** Dotted/bracketed path into the input, e.g. "weeks[2].workouts[0].exercises[1].values.sets" */
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  data: T | null;
  issues: ValidationIssue[];
}

export interface AIExercise {
  exerciseTypeName: string;
  /**
   * Optional Analytics Category name (Stage 10, UI_PLAN.md §5.8) - only
   * meaningful when `exerciseTypeName` doesn't match an existing catalog
   * entry and a new one gets created from this import. Resolved
   * case-insensitively against `AnalyticsCategory.name` by `planImport.ts`/
   * `workoutLogImport.ts`'s shared `resolveNewExerciseTypeCategory`; an
   * unresolvable or omitted value falls back to today's existing
   * first-non-archived-category default. This is a field on the AI JSON
   * contract only, not on `TrainingData` - see UI_PLAN.md §7's explicit
   * carve-out.
   */
  categoryName?: string;
  values: ExerciseValues;
}

export interface AIPlanWorkout {
  name?: string;
  dayOfWeek?: DayOfWeek;
  exercises: AIExercise[];
}

export interface AIPlanWeek {
  weekId: string;
  phaseName: string;
  workouts: AIPlanWorkout[];
}

export interface AIPlanOutput {
  weeks: AIPlanWeek[];
}

export interface AIWorkoutLogWorkout {
  /** ISO date string, if the AI could infer one from the pasted notes */
  date?: string;
  name?: string;
  exercises: AIExercise[];
}

export interface AIWorkoutLogOutput {
  workouts: AIWorkoutLogWorkout[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Coerces a numeric-looking string ("60") to a number, per-field type check otherwise. */
function checkField(
  raw: unknown,
  type: FieldType,
  path: string,
  issues: ValidationIssue[],
): unknown {
  if (type === "number") {
    const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
    if (typeof n !== "number" || Number.isNaN(n)) {
      issues.push({ path, message: `Expected a number, got ${JSON.stringify(raw)}.` });
      return undefined;
    }
    return n;
  }
  if (type === "string") {
    if (typeof raw !== "string") {
      issues.push({ path, message: `Expected a string, got ${JSON.stringify(raw)}.` });
      return undefined;
    }
    return raw;
  }
  // string[]
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) {
    issues.push({ path, message: `Expected an array of strings, got ${JSON.stringify(raw)}.` });
    return undefined;
  }
  return raw;
}

function validateExerciseValues(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
): ExerciseValues {
  const values: ExerciseValues = {};
  if (raw === undefined) return values;
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected an object, got ${JSON.stringify(raw)}.` });
    return values;
  }
  for (const [key, fieldType] of Object.entries(EXERCISE_VALUE_FIELDS) as [keyof ExerciseValues, FieldType][]) {
    if (!(key in raw)) continue;
    const checked = checkField((raw as Record<string, unknown>)[key], fieldType, `${path}.${key}`, issues);
    if (checked !== undefined) (values as Record<string, unknown>)[key] = checked;
  }
  return values;
}

function validateExercise(raw: unknown, path: string, issues: ValidationIssue[]): AIExercise | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected an exercise object, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = raw.exerciseTypeName;
  if (typeof name !== "string" || name.trim() === "") {
    issues.push({ path: `${path}.exerciseTypeName`, message: "Required non-empty string." });
    return null;
  }
  const categoryName = validateOptionalString(raw.categoryName, `${path}.categoryName`, issues);
  const values = validateExerciseValues(raw.values, `${path}.values`, issues);
  return { exerciseTypeName: name.trim(), categoryName, values };
}

function validateExercises(raw: unknown, path: string, issues: ValidationIssue[]): AIExercise[] {
  if (!Array.isArray(raw)) {
    issues.push({ path, message: `Expected an array, got ${JSON.stringify(raw)}.` });
    return [];
  }
  const result: AIExercise[] = [];
  raw.forEach((e, i) => {
    const validated = validateExercise(e, `${path}[${i}]`, issues);
    if (validated) result.push(validated);
  });
  return result;
}

function validateOptionalString(raw: unknown, path: string, issues: ValidationIssue[]): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string") {
    issues.push({ path, message: `Expected a string, got ${JSON.stringify(raw)}.` });
    return undefined;
  }
  return raw;
}

function validateDayOfWeek(raw: unknown, path: string, issues: ValidationIssue[]): DayOfWeek | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || !DAYS_OF_WEEK.includes(raw as DayOfWeek)) {
    issues.push({ path, message: `Expected one of ${DAYS_OF_WEEK.join(", ")}, got ${JSON.stringify(raw)}.` });
    return undefined;
  }
  return raw as DayOfWeek;
}

function validatePlanWorkout(raw: unknown, path: string, issues: ValidationIssue[]): AIPlanWorkout | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a workout object, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const name = validateOptionalString(raw.name, `${path}.name`, issues);
  const dayOfWeek = validateDayOfWeek(raw.dayOfWeek, `${path}.dayOfWeek`, issues);
  const exercises = validateExercises(raw.exercises, `${path}.exercises`, issues);
  return { name, dayOfWeek, exercises };
}

function validatePlanWeek(raw: unknown, path: string, issues: ValidationIssue[]): AIPlanWeek | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a week object, got ${JSON.stringify(raw)}.` });
    return null;
  }
  const weekId = raw.weekId;
  if (typeof weekId !== "string" || !/^\d{4}-W\d{2}$/.test(weekId)) {
    issues.push({ path: `${path}.weekId`, message: `Expected a week id like "2026-W25", got ${JSON.stringify(weekId)}.` });
  }
  const phaseName = raw.phaseName;
  if (typeof phaseName !== "string" || phaseName.trim() === "") {
    issues.push({ path: `${path}.phaseName`, message: "Required non-empty string." });
  }
  if (!Array.isArray(raw.workouts)) {
    issues.push({ path: `${path}.workouts`, message: `Expected an array, got ${JSON.stringify(raw.workouts)}.` });
    return null;
  }
  const workouts: AIPlanWorkout[] = [];
  raw.workouts.forEach((w, i) => {
    const validated = validatePlanWorkout(w, `${path}.workouts[${i}]`, issues);
    if (validated) workouts.push(validated);
  });
  if (typeof weekId !== "string" || typeof phaseName !== "string") return null;
  return { weekId, phaseName: phaseName.trim(), workouts };
}

/**
 * Validates a parsed JSON value against the `AIPlanOutput` contract.
 * Does not parse JSON itself - see `parseAIPlanOutput` for the
 * JSON.parse-and-validate convenience used by the import UI.
 */
export function validateAIPlanOutput(raw: unknown): ValidationResult<AIPlanOutput> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(raw)) {
    issues.push({ path: "", message: "Top-level JSON must be an object." });
    return { valid: false, data: null, issues };
  }
  if (!Array.isArray(raw.weeks)) {
    issues.push({ path: "weeks", message: `Expected an array, got ${JSON.stringify(raw.weeks)}.` });
    return { valid: false, data: null, issues };
  }
  const weeks: AIPlanWeek[] = [];
  raw.weeks.forEach((w, i) => {
    const validated = validatePlanWeek(w, `weeks[${i}]`, issues);
    if (validated) weeks.push(validated);
  });
  if (issues.length > 0) return { valid: false, data: null, issues };
  return { valid: true, data: { weeks }, issues: [] };
}

function validateWorkoutLogWorkout(raw: unknown, path: string, issues: ValidationIssue[]): AIWorkoutLogWorkout | null {
  if (!isPlainObject(raw)) {
    issues.push({ path, message: `Expected a workout object, got ${JSON.stringify(raw)}.` });
    return null;
  }
  let date: string | undefined;
  if (raw.date !== undefined) {
    if (typeof raw.date !== "string" || Number.isNaN(new Date(raw.date).getTime())) {
      issues.push({ path: `${path}.date`, message: `Expected a valid ISO date string, got ${JSON.stringify(raw.date)}.` });
    } else {
      date = raw.date;
    }
  }
  const name = validateOptionalString(raw.name, `${path}.name`, issues);
  const exercises = validateExercises(raw.exercises, `${path}.exercises`, issues);
  return { date, name, exercises };
}

/**
 * Validates a parsed JSON value against the `AIWorkoutLogOutput` contract -
 * the "paste free-text training notes, get structured exercises" flow.
 * Reuses the same per-exercise validation as `AIPlanOutput` (same
 * `AIExercise` shape, same name-resolution rule at import time).
 */
export function validateAIWorkoutLogOutput(raw: unknown): ValidationResult<AIWorkoutLogOutput> {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(raw)) {
    issues.push({ path: "", message: "Top-level JSON must be an object." });
    return { valid: false, data: null, issues };
  }
  if (!Array.isArray(raw.workouts)) {
    issues.push({ path: "workouts", message: `Expected an array, got ${JSON.stringify(raw.workouts)}.` });
    return { valid: false, data: null, issues };
  }
  const workouts: AIWorkoutLogWorkout[] = [];
  raw.workouts.forEach((w, i) => {
    const validated = validateWorkoutLogWorkout(w, `workouts[${i}]`, issues);
    if (validated) workouts.push(validated);
  });
  if (issues.length > 0) return { valid: false, data: null, issues };
  return { valid: true, data: { workouts }, issues: [] };
}

/**
 * JSON.parse + validate in one step, for pasted text straight from the
 * clipboard - garbage/non-JSON text and truncated input both surface as a
 * single clear issue instead of throwing.
 */
export function parseAIPlanOutput(text: string): ValidationResult<AIPlanOutput> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err: any) {
    return { valid: false, data: null, issues: [{ path: "", message: `Could not parse as JSON: ${err.message}` }] };
  }
  return validateAIPlanOutput(raw);
}

export function parseAIWorkoutLogOutput(text: string): ValidationResult<AIWorkoutLogOutput> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err: any) {
    return { valid: false, data: null, issues: [{ path: "", message: `Could not parse as JSON: ${err.message}` }] };
  }
  return validateAIWorkoutLogOutput(raw);
}

/** The set of `ExerciseValues` fields an AI import is allowed to set, for prompt text. */
export const AI_EXERCISE_VALUE_FIELD_NAMES = Object.keys(EXERCISE_VALUE_FIELDS);

/**
 * Embedded verbatim in the "Generate Plan" AI prompt (`AIPromptModal.svelte`)
 * so the instructions and the validator can't silently drift apart -
 * PLAN.md requires the prompt to "include the AIPlanOutput JSON schema/shape
 * inline and explicitly instruct the AI to return only JSON matching it."
 */
export const AI_PLAN_OUTPUT_INSTRUCTIONS = `Respond with ONLY a single JSON object matching exactly this shape - no markdown code fences, no commentary before or after it:

{
  "weeks": [
    {
      "weekId": "2026-W25",
      "phaseName": "Capacity",
      "workouts": [
        {
          "name": "Session name",
          "dayOfWeek": "Monday",
          "exercises": [
            { "exerciseTypeName": "Hangboard", "values": { "duration": 30, "sets": 5, "reps": 6, "timeOn": 10, "timeOff": 180, "notes": "optional" } }
          ]
        }
      ]
    }
  ]
}

Rules:
- "weekId" must be one of the exact week ids from the Target Timeframe above (format "YYYY-Www").
- "phaseName" should be one of the Available Phases listed above where possible.
- "exerciseTypeName" should be one of the Custom Exercise Modalities listed above where possible; invent a new, sensibly-named one only if nothing fits.
- "categoryName" - only include this if "exerciseTypeName" is a new, invented one (not one of the Custom Exercise Modalities listed above): set it to the closest match from the Analytics Categories listed above. Omit it entirely when reusing an existing exercise type.
- "dayOfWeek" (if given) must be exactly one of: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday.
- "values" may include any of: ${AI_EXERCISE_VALUE_FIELD_NAMES.join(", ")}. Every numeric field must be a JSON number, not a quoted string.
- Every week in the Target Timeframe must appear exactly once, even if it's a rest/deload week with an empty "workouts" array.`;

/**
 * Static instructions for the "paste free-text training notes, get
 * structured exercises" workout-log flow (`AIImportModal.svelte`,
 * "Workout Log" mode) - unlike the plan prompt, this has no per-user context
 * to embed, so it's a fixed template the user prepends to their own notes.
 */
export const AI_WORKOUT_LOG_OUTPUT_INSTRUCTIONS = `You are structuring free-text climbing/training notes into JSON. Respond with ONLY a single JSON object matching exactly this shape - no markdown code fences, no commentary before or after it:

{
  "workouts": [
    {
      "date": "2026-09-16",
      "name": "Session name",
      "exercises": [
        { "exerciseTypeName": "Hangboard", "values": { "duration": 30, "sets": 5, "reps": 6, "timeOn": 10, "timeOff": 180, "notes": "optional" } }
      ]
    }
  ]
}

Rules:
- "date" (if you can infer one) must be an ISO date string ("YYYY-MM-DD").
- "exerciseTypeName" is a free-text exercise name - use whatever name best matches what was described.
- "values" may include any of: ${AI_EXERCISE_VALUE_FIELD_NAMES.join(", ")}. Every numeric field must be a JSON number, not a quoted string.

Here are my training notes to structure:
`;

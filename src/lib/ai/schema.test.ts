import { describe, it, expect } from "vitest";
import {
  validateAIPlanOutput,
  validateAIWorkoutLogOutput,
  parseAIPlanOutput,
  parseAIWorkoutLogOutput,
} from "./schema";

const VALID_PLAN = {
  weeks: [
    {
      weekId: "2026-W25",
      phaseName: "Capacity",
      workouts: [
        {
          name: "Fingerboard AM",
          dayOfWeek: "Monday",
          exercises: [
            { exerciseTypeName: "Hangboard", values: { duration: 30, sets: 5, reps: 6, timeOn: 10, timeOff: 180 } },
          ],
        },
      ],
    },
  ],
};

const VALID_LOG = {
  workouts: [
    {
      date: "2026-09-16",
      name: "Evening session",
      exercises: [{ exerciseTypeName: "Free Bouldering", values: { duration: 90, climbingStyle: ["Power"] } }],
    },
  ],
};

describe("validateAIPlanOutput", () => {
  it("accepts a well-formed plan", () => {
    const result = validateAIPlanOutput(VALID_PLAN);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.data?.weeks[0].weekId).toBe("2026-W25");
    expect(result.data?.weeks[0].workouts[0].exercises[0].exerciseTypeName).toBe("Hangboard");
  });

  it("accepts an empty weeks array", () => {
    const result = validateAIPlanOutput({ weeks: [] });
    expect(result.valid).toBe(true);
    expect(result.data?.weeks).toEqual([]);
  });

  it("accepts a week with zero workouts (rest/deload week)", () => {
    const result = validateAIPlanOutput({ weeks: [{ weekId: "2026-W25", phaseName: "Deload", workouts: [] }] });
    expect(result.valid).toBe(true);
  });

  it("ignores unrecognized extra fields anywhere in the document", () => {
    const withExtras = JSON.parse(JSON.stringify(VALID_PLAN));
    withExtras.rationale = "because periodization";
    withExtras.weeks[0].commentary = "peak week";
    withExtras.weeks[0].workouts[0].exercises[0].values.madeUpField = "ignored";
    const result = validateAIPlanOutput(withExtras);
    expect(result.valid).toBe(true);
  });

  it("coerces a numeric field given as a numeric string", () => {
    const withStringNumber = JSON.parse(JSON.stringify(VALID_PLAN));
    withStringNumber.weeks[0].workouts[0].exercises[0].values.duration = "30";
    const result = validateAIPlanOutput(withStringNumber);
    expect(result.valid).toBe(true);
    expect(result.data?.weeks[0].workouts[0].exercises[0].values.duration).toBe(30);
  });

  // --- Deliberately malformed / adversarial cases ---

  it("rejects non-object top-level input", () => {
    expect(validateAIPlanOutput([1, 2, 3]).valid).toBe(false);
    expect(validateAIPlanOutput("just a string").valid).toBe(false);
    expect(validateAIPlanOutput(null).valid).toBe(false);
    expect(validateAIPlanOutput(42).valid).toBe(false);
  });

  it("rejects a document with no weeks array", () => {
    const result = validateAIPlanOutput({ notWeeks: [] });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "weeks")).toBe(true);
  });

  it("rejects when weeks is not an array", () => {
    const result = validateAIPlanOutput({ weeks: "week 25" });
    expect(result.valid).toBe(false);
  });

  it("rejects a week missing weekId", () => {
    const bad = { weeks: [{ phaseName: "Capacity", workouts: [] }] };
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "weeks[0].weekId")).toBe(true);
  });

  it("rejects a malformed weekId format", () => {
    const bad = { weeks: [{ weekId: "week 25 of 2026", phaseName: "Capacity", workouts: [] }] };
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects a week missing phaseName", () => {
    const bad = { weeks: [{ weekId: "2026-W25", workouts: [] }] };
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "weeks[0].phaseName")).toBe(true);
  });

  it("rejects an empty-string phaseName", () => {
    const bad = { weeks: [{ weekId: "2026-W25", phaseName: "   ", workouts: [] }] };
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects a workout missing the exercises array", () => {
    const bad = { weeks: [{ weekId: "2026-W25", phaseName: "Capacity", workouts: [{ name: "Session" }] }] };
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path === "weeks[0].workouts[0].exercises")).toBe(true);
  });

  it("rejects an exercise missing exerciseTypeName", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    delete bad.weeks[0].workouts[0].exercises[0].exerciseTypeName;
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path.endsWith("exerciseTypeName"))).toBe(true);
  });

  it("rejects an empty-string exerciseTypeName", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].exerciseTypeName = "";
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects a non-numeric value for a numeric field", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].values.sets = "a lot";
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path.endsWith("values.sets"))).toBe(true);
  });

  it("rejects a boolean for a numeric field", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].values.duration = true;
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects a string where a string[] field is expected", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].values.climbingStyle = "Power";
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.path.endsWith("values.climbingStyle"))).toBe(true);
  });

  it("rejects a mixed-type array for a string[] field", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].values.climbingStyle = ["Power", 3];
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects an invalid dayOfWeek value", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].dayOfWeek = "Funday";
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("rejects when a value object is itself the wrong type", () => {
    const bad = JSON.parse(JSON.stringify(VALID_PLAN));
    bad.weeks[0].workouts[0].exercises[0].values = "duration 30 sets 5";
    expect(validateAIPlanOutput(bad).valid).toBe(false);
  });

  it("collects every issue in the document, not just the first", () => {
    const bad = {
      weeks: [
        { phaseName: "", workouts: "not-an-array" },
        { weekId: "2026-W26", phaseName: "Strength", workouts: [{ exercises: [{ values: { sets: "many" } }] }] },
      ],
    };
    const result = validateAIPlanOutput(bad);
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(2);
  });
});

describe("parseAIPlanOutput (JSON.parse + validate)", () => {
  it("parses and validates well-formed JSON text", () => {
    const result = parseAIPlanOutput(JSON.stringify(VALID_PLAN));
    expect(result.valid).toBe(true);
  });

  it("rejects garbage non-JSON text without throwing", () => {
    expect(() => parseAIPlanOutput("Sure! Here's your plan: totally not json {{{")).not.toThrow();
    const result = parseAIPlanOutput("Sure! Here's your plan: totally not json {{{");
    expect(result.valid).toBe(false);
    expect(result.data).toBeNull();
    expect(result.issues[0].message).toMatch(/Could not parse as JSON/);
  });

  it("rejects empty input", () => {
    const result = parseAIPlanOutput("");
    expect(result.valid).toBe(false);
  });

  it("rejects truncated/incomplete JSON", () => {
    const truncated = JSON.stringify(VALID_PLAN).slice(0, 40);
    const result = parseAIPlanOutput(truncated);
    expect(result.valid).toBe(false);
    expect(result.data).toBeNull();
  });

  it("rejects JSON wrapped in markdown code fences (a common LLM habit)", () => {
    const fenced = "```json\n" + JSON.stringify(VALID_PLAN) + "\n```";
    const result = parseAIPlanOutput(fenced);
    // Deliberately not stripped automatically - surfaced as an error so the
    // user knows to paste raw JSON, rather than silently guessing at intent.
    expect(result.valid).toBe(false);
  });
});

describe("validateAIWorkoutLogOutput", () => {
  it("accepts a well-formed workout log", () => {
    const result = validateAIWorkoutLogOutput(VALID_LOG);
    expect(result.valid).toBe(true);
    expect(result.data?.workouts[0].exercises[0].values.climbingStyle).toEqual(["Power"]);
  });

  it("accepts a workout log with no date", () => {
    const result = validateAIWorkoutLogOutput({ workouts: [{ exercises: [{ exerciseTypeName: "Campus Board" }] }] });
    expect(result.valid).toBe(true);
    expect(result.data?.workouts[0].date).toBeUndefined();
  });

  it("rejects an invalid date string", () => {
    const bad = { workouts: [{ date: "not a date", exercises: [{ exerciseTypeName: "Campus Board" }] }] };
    expect(validateAIWorkoutLogOutput(bad).valid).toBe(false);
  });

  it("rejects a missing workouts array", () => {
    expect(validateAIWorkoutLogOutput({}).valid).toBe(false);
  });

  it("rejects an exercise missing exerciseTypeName", () => {
    const bad = { workouts: [{ exercises: [{ values: { duration: 10 } }] }] };
    expect(validateAIWorkoutLogOutput(bad).valid).toBe(false);
  });
});

describe("parseAIWorkoutLogOutput (JSON.parse + validate)", () => {
  it("parses and validates well-formed JSON text", () => {
    expect(parseAIWorkoutLogOutput(JSON.stringify(VALID_LOG)).valid).toBe(true);
  });

  it("rejects garbage non-JSON text", () => {
    const result = parseAIWorkoutLogOutput("not json at all");
    expect(result.valid).toBe(false);
    expect(result.data).toBeNull();
  });
});

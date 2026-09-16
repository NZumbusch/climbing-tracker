import { calculatePlannedLoad } from "../types";
import {
  DEFAULT_TEMPLATES,
  DEFAULT_BENCHMARK_TYPES,
  DEFAULT_ANALYTICS_CATEGORIES,
} from "../constants";
import { generateId } from "../utils";

// --- Migration Helper ---

/**
 * One step in the migration registry. Extracted verbatim (Phase 0) from the
 * previous hand-rolled if-chain — each step's `migrate` body is the same
 * code that used to live inside `if (importVersion === "X.Y") { ... }`.
 */
interface MigrationStep {
  from: string; // exportVersion this step applies to
  to: string; // exportVersion after this step
  describe: string;
  migrate: (data: any) => void; // mutates in place
}

const migratePre21 = (data: any) => {
  data.benchmarks = data.benchmarks || [];
  data.benchmarkTypes = data.benchmarkTypes || DEFAULT_BENCHMARK_TYPES;
};

// Frozen old-shape snapshot of defaults.json's pre-Phase-1 "Deload" template,
// used only by the 2.3->2.4 step below. That step's fallback historically
// pulled from the live DEFAULT_TEMPLATES constant, which is fine as long as
// DEFAULT_TEMPLATES stays old-shape - but Phase 1 converts defaults.json's
// templates to the new typeId/prescribed ExerciseSlot shape, so this step
// needs its own frozen copy of what DEFAULT_TEMPLATES["Deload"] produced
// before that change, or it would inject new-shape data into what the rest
// of this (old-shape) migration step still assumes is a flat Exercise[].
// Confirmed reachable, not theoretical: backup-2.1.json is missing a
// "Deload" key and hits this fallback (see PROGRESS.md 2026-09-16).
const LEGACY_DEFAULT_DELOAD_TEMPLATE = [
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
  },
];

// Fixed id mapping for the Phase 3 PhaseDef migration (PLAN.md). By the time
// data reaches version 3.19, the 3.7->3.8 and 3.13->3.14 steps above have
// already normalized every phase value down to these 7 canonical names, so
// the mapping can be a direct lookup rather than needing to handle the older
// pre-rename names ("Work Capacity", "Maintenance", ...) too.
const BUILTIN_PHASE_DEFS = [
  { id: "phase-capacity", name: "Capacity", color: "bg-success-hover", order: 1 },
  { id: "phase-strength", name: "Strength", color: "bg-rose-500", order: 2 },
  { id: "phase-power", name: "Power", color: "bg-amber-500", order: 3 },
  { id: "phase-power-endurance", name: "Power Endurance", color: "bg-tertiary-hover", order: 4 },
  { id: "phase-performance", name: "Performance", color: "bg-sky-500", order: 5 },
  { id: "phase-taper", name: "Taper", color: "bg-cyan-500", order: 6 },
  { id: "phase-deload", name: "Deload", color: "bg-zinc-500", order: 7 },
];

/**
 * Shared "look up an existing PhaseDef by name, or create an archived
 * placeholder for it" resolver, matching the same archived-placeholder
 * pattern the 3.14->3.15/3.15->3.16 Phase 1 steps use for typeId/categoryId
 * (principle 2 - archived, never hard-deleted, once referenced). Used by two
 * separate migration steps (periodization, then templates) against the same
 * evolving `data.phaseDefs` array, so a name unresolved in one step but seen
 * again in the other still maps to the same id rather than creating a
 * duplicate placeholder.
 */
function makePhaseIdResolver(data: any): (name: string) => string {
  const placeholderIds = new Map<string, string>();
  return (name: string): string => {
    const existing = data.phaseDefs.find((p: any) => p.name === name);
    if (existing) return existing.id;
    if (placeholderIds.has(name)) return placeholderIds.get(name)!;
    const id = generateId();
    data.phaseDefs.push({ id, name, archived: true });
    placeholderIds.set(name, id);
    return id;
  };
}

const MIGRATIONS: MigrationStep[] = [
  // The original if-chain treated missing/"1.0"/"2.0" as one compound
  // condition sharing one action; the initial `version = data.exportVersion
  // || "1.0"` below already folds "missing" into "1.0", so this needs two
  // registry entries (one per remaining input version) sharing one migrate fn.
  {
    from: "1.0",
    to: "2.1",
    describe: "Added benchmarks and benchmarkTypes",
    migrate: migratePre21,
  },
  {
    from: "2.0",
    to: "2.1",
    describe: "Added benchmarks and benchmarkTypes",
    migrate: migratePre21,
  },
  {
    from: "2.1",
    to: "2.2",
    describe: "Renamed fields, added climbingStyle/boardType",
    migrate: (data: any) => {
      const migrateExercise = (e: any) => {
        // Rename fields
        if (e.addedWeight !== undefined) {
          e.weight = e.addedWeight;
          delete e.addedWeight;
        }
        if (e.rungSize !== undefined) {
          e.holdSize = e.rungSize;
          delete e.rungSize;
        }

        // Map boulderingType
        if (e.boulderingType) {
          const bType = e.boulderingType;
          if (bType === "Kilterboard" || bType === "Moonboard") {
            e.boardType = bType;
            e.climbingStyle = "Board";
          } else if (
            ["Slab", "Overhang", "Coordination"].includes(bType)
          ) {
            e.climbingStyle = bType;
          }
          delete e.boulderingType;
        }
      };

      data.workouts?.forEach((w: any) =>
        w.exercises?.forEach(migrateExercise),
      );
      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => t.exercises?.forEach(migrateExercise)),
        );
      }
    },
  },
  {
    from: "2.2",
    to: "2.3",
    describe: "Added plannedLoad and timeOn/Off",
    migrate: (data: any) => {
      const migrateExercise = (e: any) => {
        if (e.plannedLoad === undefined) e.plannedLoad = 5;
      };

      data.workouts?.forEach((w: any) => {
        if (w.plannedLoad === undefined && w.exercises) {
          w.plannedLoad = w.exercises.reduce(
            (acc: number, e: any) => acc + (e.plannedLoad || 0),
            0,
          );
        }
        w.exercises?.forEach(migrateExercise);
      });

      if (data.exerciseTypes) {
        data.exerciseTypes.forEach((t: any) => {
          if (t.defaultPlannedLoad === undefined)
            t.defaultPlannedLoad = 5;
        });
      }
    },
  },
  {
    from: "2.3",
    to: "2.4",
    describe: "Added reps and distance",
    migrate: (data: any) => {
      // Ensure Running is added to exerciseTypes if it's the default list
      if (data.exerciseTypes && Array.isArray(data.exerciseTypes)) {
        const hasRunning = data.exerciseTypes.some(
          (t: any) => t.id === "running",
        );
        if (!hasRunning) {
          data.exerciseTypes.push({
            id: "running",
            name: "Running",
            category: "Other",
            parameters: ["duration", "distance"],
            defaultPlannedLoad: 4,
          });
        }
      }

      // Ensure Deload is in templates
      if (data.templates && !data.templates["Deload"]) {
        // Deep-clone: later migration steps mutate this in place (e.g. the
        // Phase 1 restructuring step reassigns w.exercises), and the source
        // is a shared module-level constant - assigning it by reference
        // would corrupt it for any later migration run in this process that
        // hits this same fallback (confirmed via a test that runs this path
        // twice in one process - see storage.phase1.test.ts).
        data.templates["Deload"] = JSON.parse(JSON.stringify(LEGACY_DEFAULT_DELOAD_TEMPLATE));
      }
    },
  },
  {
    from: "2.4",
    to: "2.5",
    describe: "Fixed plannedLoad calculation formula",
    migrate: (data: any) => {
      data.workouts?.forEach((w: any) => {
        if (w.exercises) {
          w.plannedLoad = w.exercises.reduce(
            (acc: number, e: any) => acc + calculatePlannedLoad(e),
            0,
          );
        }
      });

      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => {
            if (t.exercises) {
               t.plannedLoad = t.exercises.reduce(
                (acc: number, e: any) => acc + calculatePlannedLoad(e),
                0,
              );
            }
          }),
        );
      }
    },
  },
  {
    from: "2.5",
    to: "2.6",
    describe:
      'Force recalculation of plannedLoad to fix potential "0" string issues and ensure consistency',
    migrate: (data: any) => {
      data.workouts?.forEach((w: any) => {
        if (w.exercises && w.exercises.length > 0) {
          w.plannedLoad = w.exercises.reduce(
            (acc: number, e: any) => acc + calculatePlannedLoad(e),
            0,
          );
        }
      });

      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => {
            if (t.exercises && t.exercises.length > 0) {
              t.plannedLoad = t.exercises.reduce(
                (acc: number, e: any) => acc + calculatePlannedLoad(e),
                0,
              );
            }
          }),
        );
      }
    },
  },
  {
    from: "2.6",
    to: "2.7",
    describe: "Convert all IDs to strings for future UUID support",
    migrate: (data: any) => {
      data.workouts?.forEach((w: any) => {
        w.id = String(w.id);
        w.exercises?.forEach((e: any) => {
          e.id = String(e.id);
        });
      });
      data.benchmarks?.forEach((b: any) => {
        b.id = String(b.id);
      });
    },
  },
  {
    from: "2.7",
    to: "2.8",
    describe: "Add Fingers category",
    migrate: (data: any) => {
      if (data.exerciseTypes) {
        data.exerciseTypes.forEach((t: any) => {
          if (t.id === "max-hangs") {
            t.category = "Fingers";
          }
        });
      }
    },
  },
  {
    from: "2.8",
    to: "2.9",
    describe: "Convert climbingStyle from string to array",
    migrate: (data: any) => {
      const migrateClimbingStyle = (e: any) => {
        if (typeof e.climbingStyle === "string") {
          e.climbingStyle = [e.climbingStyle];
        }
      };
      data.workouts?.forEach((w: any) =>
        w.exercises?.forEach(migrateClimbingStyle),
      );
      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => t.exercises?.forEach(migrateClimbingStyle)),
        );
      }
    },
  },
  {
    from: "2.9",
    to: "3.0",
    describe: "Add analyticsCategories",
    migrate: (data: any) => {
      if (!data.analyticsCategories) {
        data.analyticsCategories = [...DEFAULT_ANALYTICS_CATEGORIES];
      }

      const existingCats = new Set(data.analyticsCategories.map((c: any) => c.name));
      const missingCats = new Set<string>();

      data.exerciseTypes?.forEach((t: any) => {
        if (t.category && !existingCats.has(t.category)) {
          missingCats.add(t.category);
        }
      });

      data.workouts?.forEach((w: any) => {
        w.exercises?.forEach((e: any) => {
          if (e.category && !existingCats.has(e.category)) {
            missingCats.add(e.category);
          }
        });
      });

      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) => {
          phase?.forEach((t: any) => {
            t.exercises?.forEach((e: any) => {
              if (e.category && !existingCats.has(e.category)) {
                missingCats.add(e.category);
              }
            });
          });
        });
      }

      missingCats.forEach((catName) => {
        data.analyticsCategories.push({
          id: generateId(),
          name: catName,
          color: "bg-zinc-500"
        });
        existingCats.add(catName);
      });
    },
  },
  {
    from: "3.0",
    to: "3.1",
    describe: "Add Mobility to exerciseTypes",
    migrate: (data: any) => {
      if (data.exerciseTypes && Array.isArray(data.exerciseTypes)) {
        const hasMobility = data.exerciseTypes.some((t: any) => t.id === "mobility");
        if (!hasMobility) {
          data.exerciseTypes.push({
            id: "mobility",
            name: "Mobility",
            category: "Other",
            parameters: ["duration", "mobilityType"],
            defaultPlannedLoad: 2,
          });
        }
      }
    },
  },
  {
    from: "3.1",
    to: "3.2",
    describe: "Rename grades to boulderingGrades, add lead-climbing",
    migrate: (data: any) => {
      if (data.exerciseTypes && Array.isArray(data.exerciseTypes)) {
        data.exerciseTypes.forEach((t: any) => {
          if (t.parameters) {
            t.parameters = t.parameters.map((p: string) => p === "grades" ? "boulderingGrades" : p);

            if ((t.id === "free-bouldering" || t.id === "board-session") && !t.parameters.includes("variant")) {
              t.parameters.push("variant");
            }
          }
        });

        const hasLeadClimbing = data.exerciseTypes.some((t: any) => t.id === "lead-climbing");
        if (!hasLeadClimbing) {
          data.exerciseTypes.push({
            id: "lead-climbing",
            name: "Lead Climbing",
            category: "Power Endurance",
            parameters: ["duration", "routeGrades", "cadence", "leadStyle"],
            defaultPlannedLoad: 7,
          });
        }
      }
    },
  },
  {
    from: "3.2",
    to: "3.3",
    describe: "Add startTime to workouts if missing",
    migrate: (data: any) => {
      if (data.workouts && Array.isArray(data.workouts)) {
        data.workouts.forEach((w: any) => {
          if (!w.startTime) {
            // Attempt to extract time from ISO date if available and completed
            if (w.status === "completed" && w.date) {
              const dateObj = new Date(w.date);
              w.startTime = `${String(dateObj.getHours()).padStart(2, "0")}:${String(dateObj.getMinutes()).padStart(2, "0")}`;
            } else {
              w.startTime = "12:00"; // default for old planned workouts
            }
          }
        });
      }
    },
  },
  {
    from: "3.3",
    to: "3.4",
    describe: "Add timeOn to boulder-intervals parameters",
    migrate: (data: any) => {
      if (data.exerciseTypes && Array.isArray(data.exerciseTypes)) {
        data.exerciseTypes.forEach((t: any) => {
          if (t.id === "boulder-intervals" && t.parameters && !t.parameters.includes("timeOn")) {
            const restTimeIdx = t.parameters.indexOf("restTime");
            if (restTimeIdx !== -1) {
              t.parameters.splice(restTimeIdx, 0, "timeOn");
            } else {
              t.parameters.push("timeOn");
            }
          }
        });
      }
    },
  },
  {
    from: "3.4",
    to: "3.5",
    describe: "Split boulder-intervals into time-based-intervals and rep-based-intervals",
    migrate: (data: any) => {
      const migrateExercise = (e: any) => {
        if (e.type === "Boulder Intervals") {
          if (e.variant === "4x4" || e.variant === "emom" || e.reps !== undefined) {
            e.type = "Rep-Based Intervals";
          } else {
            e.type = "Time-Based Intervals";
          }
        }
      };

      data.workouts?.forEach((w: any) =>
        w.exercises?.forEach(migrateExercise),
      );
      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => t.exercises?.forEach(migrateExercise)),
        );
      }

      if (data.exerciseTypes && Array.isArray(data.exerciseTypes)) {
        data.exerciseTypes = data.exerciseTypes.filter((t: any) => t.id !== "boulder-intervals");

        const hasTimeBased = data.exerciseTypes.some((t: any) => t.id === "time-based-intervals");
        if (!hasTimeBased) {
          data.exerciseTypes.push({
            id: "time-based-intervals",
            name: "Time-Based Intervals",
            category: "Power Bouldering",
            parameters: ["duration", "sets", "timeOn", "restTime"],
            defaultPlannedLoad: 7,
          });
        }

        const hasRepBased = data.exerciseTypes.some((t: any) => t.id === "rep-based-intervals");
        if (!hasRepBased) {
          data.exerciseTypes.push({
            id: "rep-based-intervals",
            name: "Rep-Based Intervals",
            category: "Power Bouldering",
            parameters: ["duration", "sets", "reps", "restTime", "movesPerRoute"],
            defaultPlannedLoad: 7,
          });
        }
      }
    },
  },
  {
    from: "3.5",
    to: "3.6",
    describe: "Update Max Hangs and Interval parameters",
    migrate: (data: any) => {
      if (data.exerciseTypes && Array.isArray(data.exerciseTypes)) {
        data.exerciseTypes.forEach((t: any) => {
          if (t.id === "max-hangs" && t.parameters) {
            if (!t.parameters.includes("bodyweightPercent")) {
              t.parameters.push("bodyweightPercent");
            }
            if (!t.parameters.includes("weight")) {
              t.parameters.push("weight");
            }
          }
          if ((t.id === "time-based-intervals" || t.id === "rep-based-intervals") && t.parameters) {
            if (!t.parameters.includes("routeDifficulty")) {
              t.parameters.push("routeDifficulty");
            }
          }
        });
      }

      const migrateExercise = (e: any) => {
        if (e.type === "Max Hangs") {
          if (e.weight !== undefined && e.bodyweightPercent === undefined) {
            // Rough estimation: assume 70kg climber. 100% = 70kg.
            // Formula: (70 + weight) / 70 * 100 => 100 + (weight / 70 * 100)
            e.bodyweightPercent = Math.round(100 + (e.weight / 70) * 100);
          }
        }
      };

      data.workouts?.forEach((w: any) =>
        w.exercises?.forEach(migrateExercise),
      );
      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => t.exercises?.forEach(migrateExercise)),
        );
      }
    },
  },
  {
    from: "3.6",
    to: "3.7",
    describe: "Add maxWeightPercent support",
    migrate: (_data: any) => {
      // No explicit structure changes needed yet, just tracking version
    },
  },
  {
    from: "3.7",
    to: "3.8",
    describe:
      "Rename phases: Work Capacity -> Capacity, Max Strength -> Strength, Performance / Taper split",
    migrate: (data: any) => {
      data.periodization?.forEach((p: any) => {
        if (p.phase === "Work Capacity") p.phase = "Capacity";
        if (p.phase === "Max Strength") p.phase = "Strength";
        if (p.phase === "Performance / Taper") p.phase = "Performance";
      });

      if (data.templates) {
        if (data.templates["Work Capacity"]) {
          data.templates["Capacity"] = data.templates["Work Capacity"];
          delete data.templates["Work Capacity"];
        }
        if (data.templates["Max Strength"]) {
          data.templates["Strength"] = data.templates["Max Strength"];
          delete data.templates["Max Strength"];
        }
        if (data.templates["Performance / Taper"]) {
          data.templates["Performance"] = data.templates["Performance / Taper"];
          delete data.templates["Performance / Taper"];
        }

        // Ensure all phase templates exist, even if missing from migration
        if (!data.templates["Capacity"]) data.templates["Capacity"] = DEFAULT_TEMPLATES["Capacity"] || [];
        if (!data.templates["Strength"]) data.templates["Strength"] = DEFAULT_TEMPLATES["Strength"] || [];
        if (!data.templates["Performance"]) data.templates["Performance"] = DEFAULT_TEMPLATES["Performance"] || [];
        if (!data.templates["Taper"]) data.templates["Taper"] = DEFAULT_TEMPLATES["Taper"] || [];
      }
    },
  },
  {
    from: "3.8",
    to: "3.9",
    describe:
      "Merge boulderingGrades and routeGrades to grades, remove variant (preserving it into notes)",
    migrate: (data: any) => {
      if (data.exerciseTypes && Array.isArray(data.exerciseTypes)) {
        data.exerciseTypes.forEach((t: any) => {
          if (t.parameters) {
            t.parameters = t.parameters.map((p: string) => p === "boulderingGrades" || p === "routeGrades" ? "grades" : p);
            t.parameters = t.parameters.filter((p: string) => p !== "variant");
            // Remove duplicates
            t.parameters = Array.from(new Set(t.parameters));
          }
          if (t.possibleParameters) {
            t.possibleParameters = t.possibleParameters.map((p: string) => p === "boulderingGrades" || p === "routeGrades" ? "grades" : p);
            t.possibleParameters = t.possibleParameters.filter((p: string) => p !== "variant");
            t.possibleParameters = Array.from(new Set(t.possibleParameters));
          }
        });
      }

      const migrateExercise = (e: any) => {
        if (e.activeParameters) {
          e.activeParameters = e.activeParameters.map((p: string) => p === "boulderingGrades" || p === "routeGrades" ? "grades" : p);
          e.activeParameters = e.activeParameters.filter((p: string) => p !== "variant");
          e.activeParameters = Array.from(new Set(e.activeParameters));
        }

        // Merge minRouteGrade/maxRouteGrade into minGrade/maxGrade
        if (e.minRouteGrade && !e.minGrade) {
          e.minGrade = e.minRouteGrade;
        }
        if (e.maxRouteGrade && !e.maxGrade) {
          e.maxGrade = e.maxRouteGrade;
        }

        // Delete old fields
        delete e.minRouteGrade;
        delete e.maxRouteGrade;

        // Preserve variant (only ever handled for "Boulder Intervals" exercises by the
        // 3.4->3.5 split above; other types like "Non-Free Bouldering" still carry it
        // here) by folding it into notes instead of silently dropping it.
        if (e.variant !== undefined) {
          const tag = `[Variant: ${e.variant}]`;
          e.notes = e.notes ? `${e.notes} ${tag}` : tag;
          delete e.variant;
        }
      };

      data.workouts?.forEach((w: any) =>
        w.exercises?.forEach(migrateExercise),
      );
      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => t.exercises?.forEach(migrateExercise)),
        );
      }
    },
  },
  {
    from: "3.9",
    to: "3.10",
    describe: "Support for exact reps logged per set",
    migrate: (_data: any) => {
      // actualReps is optional, so no strict structural changes to iterate through, just version bump
    },
  },
  {
    from: "3.10",
    to: "3.11",
    describe: "Added arms fatigue metric to 4-point model",
    migrate: (data: any) => {
      data.workouts?.forEach((w: any) => {
        // If a workout was completed and had fatigue metrics recorded, but lacks arms, approximate it.
        if (w.status === "completed" && w.fingers !== undefined && w.arms === undefined) {
          w.arms = w.systemic !== undefined ? w.systemic : 5;
        }
      });
    },
  },
  {
    from: "3.11",
    to: "3.12",
    describe: "Added plannedDuration and dailyReadiness",
    migrate: (data: any) => {
      data.dailyReadiness = data.dailyReadiness || [];

      // Copy duration to plannedDuration so we retain original plans
      data.workouts?.forEach((w: any) => {
        w.exercises?.forEach((e: any) => {
          if (e.plannedDuration === undefined && e.duration !== undefined) {
            e.plannedDuration = e.duration;
          }
        });
      });

      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => t.exercises?.forEach((e: any) => {
            if (e.plannedDuration === undefined && e.duration !== undefined) {
              e.plannedDuration = e.duration;
            }
          })),
        );
      }
    },
  },
  {
    from: "3.12",
    to: "3.13",
    describe:
      "Rename legacy parameter names: boulderingStyle -> climbingStyle, hangboardTimes -> timeOn",
    migrate: (data: any) => {
      const renameParam = (p: string) => {
        if (p === "boulderingStyle") return "climbingStyle";
        if (p === "hangboardTimes") return "timeOn";
        return p;
      };

      if (data.exerciseTypes && Array.isArray(data.exerciseTypes)) {
        data.exerciseTypes.forEach((t: any) => {
          if (t.parameters) {
            t.parameters = Array.from(new Set(t.parameters.map(renameParam)));
          }
          if (t.possibleParameters) {
            t.possibleParameters = Array.from(new Set(t.possibleParameters.map(renameParam)));
          }
        });
      }

      const migrateExercise = (e: any) => {
        if (e.activeParameters) {
          e.activeParameters = Array.from(new Set(e.activeParameters.map(renameParam)));
        }
      };

      data.workouts?.forEach((w: any) =>
        w.exercises?.forEach(migrateExercise),
      );
      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => t.exercises?.forEach(migrateExercise)),
        );
      }
    },
  },
  {
    from: "3.13",
    to: "3.14",
    describe:
      "Rename legacy phase values: Maintenance -> Deload, Endurance -> Power Endurance",
    migrate: (data: any) => {
      const renamePhase = (p: string) => {
        if (p === "Maintenance") return "Deload";
        if (p === "Endurance") return "Power Endurance";
        return p;
      };

      data.periodization?.forEach((p: any) => {
        p.phase = renamePhase(p.phase);
      });

      if (data.templates) {
        ["Maintenance", "Endurance"].forEach((legacyKey) => {
          if (!data.templates[legacyKey]) return;
          const targetKey = renamePhase(legacyKey);
          if (data.templates[targetKey]) {
            // Never let one silently overwrite/drop the other - concatenate.
            data.templates[targetKey] = [
              ...data.templates[targetKey],
              ...data.templates[legacyKey],
            ];
          } else {
            data.templates[targetKey] = data.templates[legacyKey];
          }
          delete data.templates[legacyKey];
        });
      }
    },
  },
  {
    from: "3.14",
    to: "3.15",
    describe:
      "Phase 1: resolve Exercise.type (name) to typeId, creating an archived placeholder ExerciseTypeDef for any unresolvable name",
    migrate: (data: any) => {
      data.exerciseTypes = data.exerciseTypes || [];
      const placeholderIds = new Map<string, string>();

      const findOrCreateTypeId = (name: string, categoryHint?: string): string => {
        const existing = data.exerciseTypes.find((t: any) => t.name === name);
        if (existing) return existing.id;
        if (placeholderIds.has(name)) return placeholderIds.get(name)!;
        const id = generateId();
        data.exerciseTypes.push({
          id,
          name,
          category: categoryHint || "Other",
          parameters: [],
          archived: true,
        });
        placeholderIds.set(name, id);
        return id;
      };

      const resolveTypeId = (e: any) => {
        if (e.typeId) return;
        const name = e.type || "Unknown Exercise";
        e.typeId = findOrCreateTypeId(name, e.category);
      };

      data.workouts?.forEach((w: any) => w.exercises?.forEach(resolveTypeId));
      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => t.exercises?.forEach(resolveTypeId)),
        );
      }
    },
  },
  {
    from: "3.15",
    to: "3.16",
    describe:
      "Phase 1: resolve Exercise.category (name override) to categoryId, creating an archived placeholder AnalyticsCategory for any unresolvable name",
    migrate: (data: any) => {
      data.analyticsCategories = data.analyticsCategories || [];
      const placeholderIds = new Map<string, string>();

      const findOrCreateCategoryId = (name: string): string => {
        const existing = data.analyticsCategories.find((c: any) => c.name === name);
        if (existing) return existing.id;
        if (placeholderIds.has(name)) return placeholderIds.get(name)!;
        const id = generateId();
        data.analyticsCategories.push({ id, name, color: "bg-zinc-500", archived: true });
        placeholderIds.set(name, id);
        return id;
      };

      const resolveCategoryId = (e: any) => {
        if (!e.category) return;
        e.categoryId = findOrCreateCategoryId(e.category);
        delete e.category;
      };

      data.workouts?.forEach((w: any) => w.exercises?.forEach(resolveCategoryId));
      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) =>
          phase?.forEach((t: any) => t.exercises?.forEach(resolveCategoryId)),
        );
      }
    },
  },
  {
    from: "3.16",
    to: "3.17",
    describe:
      "Phase 1: restructure flat Exercise[] into ExerciseSlot[] (typeId/categoryId already resolved), splitting duration/reps into prescribed vs logged",
    migrate: (data: any) => {
      // Every ExerciseValues field except duration/reps, which are the only
      // two fields that ever had a real prescribed-vs-actual split
      // historically (plannedDuration/duration since 3.11->3.12,
      // actualReps/reps since 3.9->3.10). No other field (sets, weight,
      // grades, holdSize, notes, plannedLoad, ...) ever got that treatment,
      // so for completed workouts the only honest choice is to carry the
      // single historical value into both prescribed and logged unchanged -
      // never fabricate a different "prescribed" value for them.
      const splitValues = (e: any, isCompleted: boolean) => {
        const {
          id, type, category, typeId, categoryId, activeParameters,
          duration, plannedDuration, reps, actualReps,
          ...rest
        } = e;

        const prescribed: any = { ...rest };
        const prescribedDuration = plannedDuration !== undefined ? plannedDuration : duration;
        if (prescribedDuration !== undefined) prescribed.duration = prescribedDuration;
        if (reps !== undefined) prescribed.reps = reps;

        let logged: any | undefined;
        if (isCompleted) {
          logged = { ...rest };
          if (duration !== undefined) logged.duration = duration;
          const loggedReps = actualReps !== undefined ? actualReps : reps;
          if (loggedReps !== undefined) logged.reps = loggedReps;
        }

        return { prescribed, logged };
      };

      const seenSlotIds = new Set<string>();

      const restructure = (w: any) => {
        if (!w.exercises) return;
        const isCompleted = w.status === "completed";
        w.exercises = w.exercises.map((e: any) => {
          let id = e.id;
          if (seenSlotIds.has(id)) id = generateId();
          seenSlotIds.add(id);

          const { prescribed, logged } = splitValues(e, isCompleted);
          const slot: any = { id, typeId: e.typeId, prescribed };
          if (e.activeParameters) slot.activeParameters = e.activeParameters;
          if (e.categoryId) slot.categoryId = e.categoryId;
          if (logged) slot.logged = logged;
          return slot;
        });
      };

      data.workouts?.forEach(restructure);
      if (data.templates) {
        Object.values(data.templates).forEach((phase: any) => phase?.forEach(restructure));
      }
    },
  },
  {
    from: "3.17",
    to: "3.18",
    describe:
      "Phase 1: convert dailyReadiness into metricDefs + dailyMetrics (seeding built-in sleep-score/hrv/rhr MetricDefs)",
    migrate: (data: any) => {
      const BUILTIN_METRIC_DEFS = [
        { id: "sleep-score", name: "Sleep Score", unit: "pts" },
        { id: "hrv", name: "HRV", unit: "ms" },
        { id: "rhr", name: "Resting Heart Rate", unit: "bpm" },
      ];

      data.metricDefs = data.metricDefs || [];
      BUILTIN_METRIC_DEFS.forEach((def) => {
        if (!data.metricDefs.some((m: any) => m.id === def.id)) {
          data.metricDefs.push(def);
        }
      });

      data.dailyMetrics = data.dailyMetrics || [];
      (data.dailyReadiness || []).forEach((r: any) => {
        if (!r || !r.date) return;
        const pushEntry = (metricId: string, value: any) => {
          if (value === undefined || value === null) return;
          data.dailyMetrics.push({ id: generateId(), metricId, date: r.date, value });
        };
        pushEntry("sleep-score", r.sleepScore);
        pushEntry("hrv", r.hrv);
        pushEntry("rhr", r.rhr);
      });

      delete data.dailyReadiness;
    },
  },
  {
    from: "3.18",
    to: "3.19",
    describe: "Phase 1: add painLogs (empty by default, purely additive)",
    migrate: (data: any) => {
      data.painLogs = data.painLogs || [];
    },
  },
  {
    from: "3.19",
    to: "3.20",
    describe: "Phase 3: seed the 7 built-in PhaseDefs",
    migrate: (data: any) => {
      data.phaseDefs = data.phaseDefs || [];
      BUILTIN_PHASE_DEFS.forEach((def) => {
        if (!data.phaseDefs.some((p: any) => p.id === def.id)) {
          data.phaseDefs.push({ ...def });
        }
      });
    },
  },
  {
    from: "3.20",
    to: "3.21",
    describe:
      "Phase 3: resolve PeriodizationWeek.phase (name) to phaseId, creating an archived placeholder PhaseDef for any unresolvable name",
    migrate: (data: any) => {
      data.phaseDefs = data.phaseDefs || [];
      const findOrCreatePhaseId = makePhaseIdResolver(data);

      data.periodization?.forEach((p: any) => {
        if (!p.phaseId && p.phase) {
          p.phaseId = findOrCreatePhaseId(p.phase);
        }
        delete p.phase;
      });
    },
  },
  {
    from: "3.21",
    to: "3.22",
    describe:
      "Phase 3: convert templates keyed by phase name into WorkoutTemplate[] keyed by phaseId",
    migrate: (data: any) => {
      data.phaseDefs = data.phaseDefs || [];
      const findOrCreatePhaseId = makePhaseIdResolver(data);

      if (data.templates) {
        const newTemplates: any = {};
        Object.entries(data.templates).forEach(([phaseName, list]: [string, any]) => {
          const phaseId = findOrCreatePhaseId(phaseName);
          const converted = (list || []).map((t: any) => ({
            id: generateId(),
            name: t.notes,
            dayOfWeek: t.dayOfWeek,
            exercises: t.exercises || [],
          }));
          if (newTemplates[phaseId]) {
            newTemplates[phaseId] = [...newTemplates[phaseId], ...converted];
          } else {
            newTemplates[phaseId] = converted;
          }
        });
        data.templates = newTemplates;
      }
    },
  },
];

/**
 * Handles sequential schema migrations for imported data.
 * Adheres strictly to the migration protocol defined in GEMINI.md.
 *
 * Walks the MIGRATIONS registry in array order, running every step whose
 * `from` matches the data's current version and advancing to its `to`
 * version. Because steps are listed in increasing version order, a single
 * pass reaches the current schema regardless of how many versions behind
 * the data started (each step that fires updates `version`, so a later
 * step in the same pass whose `from` now matches will fire too).
 * @param data The raw JSON data parsed from the backup file
 */
export function runDataMigrations(data: any): void {
  let version: string = data.exportVersion || "1.0";

  for (const step of MIGRATIONS) {
    if (version !== step.from) continue;
    step.migrate(data);
    version = step.to;
  }

  // Ensure the migrated data reflects the final version so the caller knows it is up to date
  data.exportVersion = version;
}

/**
 * Post-migration safety net (Phase 0). Compares the data before and after
 * running migrations and throws if it looks corrupted, so the caller can
 * roll back to the pre-migration snapshot instead of persisting bad data.
 * Deliberately conservative/cheap checks, not exhaustive validation:
 * workout/benchmark counts must be preserved, and every exercise's
 * `typeId` (Phase 1 - was the name-based `Exercise.type`) must resolve
 * against the migrated `exerciseTypes` list.
 */
export function assertMigrationInvariants(before: any, after: any): void {
  const problems: string[] = [];

  const beforeWorkoutCount = before.workouts?.length ?? 0;
  const afterWorkoutCount = after.workouts?.length ?? 0;
  if (beforeWorkoutCount !== afterWorkoutCount) {
    problems.push(
      `workout count changed (${beforeWorkoutCount} -> ${afterWorkoutCount})`,
    );
  }

  const beforeBenchmarkCount = before.benchmarks?.length ?? 0;
  const afterBenchmarkCount = after.benchmarks?.length ?? 0;
  if (beforeBenchmarkCount !== afterBenchmarkCount) {
    problems.push(
      `benchmark count changed (${beforeBenchmarkCount} -> ${afterBenchmarkCount})`,
    );
  }

  const knownTypeIds = new Set(
    (after.exerciseTypes || []).map((t: any) => t.id),
  );
  after.workouts?.forEach((w: any) => {
    w.exercises?.forEach((e: any) => {
      if (e.typeId && !knownTypeIds.has(e.typeId)) {
        problems.push(
          `workout ${w.id} has exercise with unresolvable typeId "${e.typeId}"`,
        );
      }
    });
  });

  const knownPhaseIds = new Set(
    (after.phaseDefs || []).map((p: any) => p.id),
  );
  after.periodization?.forEach((p: any) => {
    if (p.phaseId && !knownPhaseIds.has(p.phaseId)) {
      problems.push(
        `periodization week ${p.weekId} has unresolvable phaseId "${p.phaseId}"`,
      );
    }
  });

  if (problems.length > 0) {
    throw new Error(`Migration invariant check failed: ${problems.join("; ")}`);
  }
}

import localforage from "localforage";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type {
  Workout,
  PeriodizationWeek,
  ExerciseTypeDef,
  PhaseType,
  Benchmark,
  BenchmarkTypeDef,
  AnalyticsCategory,
} from "./types";
import { calculatePlannedLoad } from "./types";
import {
  DEFAULT_TEMPLATES,
  DEFAULT_EXERCISE_TYPES,
  DEFAULT_BENCHMARK_TYPES,
  DEFAULT_ANALYTICS_CATEGORIES,
  DATA_EXPORT_VERSION,
} from "./constants";
import { generateId, showAlert } from "./utils";

localforage.config({
  name: "boulder-tracker",
  storeName: "training_data_v2",
});

let _dbState: any = null;

async function initDB() {
  if (_dbState) return;

  let rawData: any = null;
  let usingNative = Capacitor.isNativePlatform();

  if (usingNative) {
    try {
      const res = await Filesystem.readFile({
        path: "boulder_tracker_db.json",
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      rawData = JSON.parse(res.data as string);
    } catch (e) {
      // File doesn't exist yet
    }
  }

  if (!rawData) {
    rawData = {
      workouts: await localforage.getItem("workouts"),
      periodization: await localforage.getItem("periodization"),
      templates: await localforage.getItem("templates"),
      exerciseTypes: await localforage.getItem("exerciseTypes"),
      benchmarks: await localforage.getItem("benchmarks"),
      benchmarkTypes: await localforage.getItem("benchmarkTypes"),
      analyticsCategories: await localforage.getItem("analyticsCategories"),
      dailyReadiness: await localforage.getItem("dailyReadiness"),
      exportVersion: await localforage.getItem("database_version"),
    };
  }

  _dbState = {
    workouts: rawData.workouts || [],
    periodization: rawData.periodization || [],
    templates: rawData.templates || DEFAULT_TEMPLATES,
    exerciseTypes: rawData.exerciseTypes || DEFAULT_EXERCISE_TYPES,
    benchmarks: rawData.benchmarks || [],
    benchmarkTypes: rawData.benchmarkTypes || DEFAULT_BENCHMARK_TYPES,
    analyticsCategories: rawData.analyticsCategories || DEFAULT_ANALYTICS_CATEGORIES,
    dailyReadiness: rawData.dailyReadiness || [],
    exportVersion: rawData.exportVersion || "1.0",
  };
}

async function flushDB() {
  if (!_dbState) return;

  if (Capacitor.isNativePlatform()) {
    try {
      await Filesystem.writeFile({
        path: "boulder_tracker_db.json",
        data: JSON.stringify(_dbState),
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
    } catch (err) {
      console.error("Failed to write to native Filesystem", err);
    }
  } else {
    await localforage.setItem("workouts", _dbState.workouts);
    await localforage.setItem("periodization", _dbState.periodization);
    await localforage.setItem("templates", _dbState.templates);
    await localforage.setItem("exerciseTypes", _dbState.exerciseTypes);
    await localforage.setItem("benchmarks", _dbState.benchmarks);
    await localforage.setItem("benchmarkTypes", _dbState.benchmarkTypes);
    await localforage.setItem("analyticsCategories", _dbState.analyticsCategories);
    await localforage.setItem("dailyReadiness", _dbState.dailyReadiness);
    await localforage.setItem("database_version", _dbState.exportVersion);
  }
}

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
        data.templates["Deload"] = DEFAULT_TEMPLATES["Deload"];
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
 * workout/benchmark counts must be preserved, and every still-name-based
 * `Exercise.type` (pre-Phase-1 — Phase 1 replaces this with `typeId`) must
 * resolve against the migrated `exerciseTypes` list.
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

  const knownTypeNames = new Set(
    (after.exerciseTypes || []).map((t: any) => t.name),
  );
  after.workouts?.forEach((w: any) => {
    w.exercises?.forEach((e: any) => {
      if (e.type && !knownTypeNames.has(e.type)) {
        problems.push(
          `workout ${w.id} has exercise with unresolvable type "${e.type}"`,
        );
      }
    });
  });

  if (problems.length > 0) {
    throw new Error(`Migration invariant check failed: ${problems.join("; ")}`);
  }
}

// Single fixed key/filename so a new backup always overwrites the previous
// one rather than accumulating - the version the backup was taken from is
// stored inside the payload itself instead of the key name.
const MIGRATION_BACKUP_KEY = "backup_pre_migration";
const MIGRATION_BACKUP_FILE = "boulder_tracker_db.backup.json";

async function writeMigrationBackup(fromVersion: string, data: any): Promise<void> {
  const payload = { fromVersion, backedUpAt: new Date().toISOString(), data };
  try {
    if (Capacitor.isNativePlatform()) {
      await Filesystem.writeFile({
        path: MIGRATION_BACKUP_FILE,
        data: JSON.stringify(payload),
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
    } else {
      await localforage.setItem(MIGRATION_BACKUP_KEY, payload);
    }
  } catch (err) {
    // A failed backup write shouldn't block migration from running - it's a
    // safety net, not a hard dependency - but it should be visible in logs.
    console.error("Failed to write pre-migration backup", err);
  }
}

/**
 * Storage singleton providing a clean interface for data persistence.
 */
export const storage = {
  // --- Private Helpers ---

  async _getWorkouts(): Promise<Workout[]> { await initDB(); return _dbState.workouts; },
  async _getPeriodization(): Promise<PeriodizationWeek[]> { await initDB(); return _dbState.periodization; },
  async _getBenchmarks(): Promise<Benchmark[]> { await initDB(); return _dbState.benchmarks; },
  async _getBenchmarkTypes(): Promise<BenchmarkTypeDef[]> { await initDB(); return _dbState.benchmarkTypes; },
  async _getAnalyticsCategories(): Promise<AnalyticsCategory[]> { await initDB(); return _dbState.analyticsCategories; },
  async _getDailyReadiness(): Promise<any[]> { await initDB(); return _dbState.dailyReadiness; },
  async _getTemplates(): Promise<Record<PhaseType, Partial<Workout>[]>> { await initDB(); return _dbState.templates; },
  async _getExerciseTypes(): Promise<ExerciseTypeDef[]> { await initDB(); return _dbState.exerciseTypes; },

  async _saveWorkouts(workouts: Workout[]): Promise<void> { await initDB(); _dbState.workouts = workouts; await flushDB(); },
  async _savePeriodization(periodization: PeriodizationWeek[]): Promise<void> { await initDB(); _dbState.periodization = periodization; await flushDB(); },
  async _saveBenchmarks(benchmarks: Benchmark[]): Promise<void> { await initDB(); _dbState.benchmarks = benchmarks; await flushDB(); },
  async _saveBenchmarkTypes(types: BenchmarkTypeDef[]): Promise<void> { await initDB(); _dbState.benchmarkTypes = types; await flushDB(); },
  async _saveAnalyticsCategories(categories: AnalyticsCategory[]): Promise<void> { await initDB(); _dbState.analyticsCategories = categories; await flushDB(); },
  async _saveDailyReadiness(readiness: any[]): Promise<void> { await initDB(); _dbState.dailyReadiness = readiness; await flushDB(); },
  async _saveTemplates(templates: Record<PhaseType, Partial<Workout>[]>): Promise<void> { await initDB(); _dbState.templates = templates; await flushDB(); },
  async _saveExerciseTypes(types: ExerciseTypeDef[]): Promise<void> { await initDB(); _dbState.exerciseTypes = types; await flushDB(); },

  // --- Public Interface ---

  /**
   * Runs migrations on the local database to ensure it matches the current schema.
   */
  async runStartupMigrations(): Promise<void> {
    await initDB();

    const currentVersion = _dbState.exportVersion;
    if (currentVersion === DATA_EXPORT_VERSION) return;

    // Snapshot before mutating, and persist it as a recoverable backup, in
    // case the migration below produces corrupted data (see the invariant
    // check just after it).
    const before = JSON.parse(JSON.stringify(_dbState));
    await writeMigrationBackup(currentVersion, before);

    // runDataMigrations modifies the object in place
    runDataMigrations(_dbState);
    _dbState.exportVersion = DATA_EXPORT_VERSION;

    try {
      assertMigrationInvariants(before, _dbState);
    } catch (err) {
      console.error(
        "Migration invariant check failed - restoring pre-migration data instead of persisting it",
        err,
        { before, after: _dbState },
      );
      _dbState = before;
      await showAlert(
        "Data Migration Failed",
        "Your data could not be safely upgraded, so it has been left unchanged to avoid data loss. Please check the console log or contact support.",
      );
      throw err;
    }

    await flushDB();
  },

  async getWorkouts(): Promise<Workout[]> {
    return this._getWorkouts();
  },

  async saveWorkout(workout: Workout): Promise<void> {
    const workouts = await this._getWorkouts();
    const index = workouts.findIndex((w) => w.id === workout.id);

    // Auto-mark week as customized
    if (workout.weekId) {
      await this.markWeekAsCustomized(workout.weekId);
    }

    if (index !== -1) {
      workouts[index] = workout;
    } else {
      workouts.push(workout);
    }
    await this._saveWorkouts(workouts);
  },

  async deleteWorkout(id: string): Promise<void> {
    const workouts = await this._getWorkouts();
    const workout = workouts.find((w) => w.id === id);
    if (workout?.weekId) {
      await this.markWeekAsCustomized(workout.weekId);
    }
    const filtered = workouts.filter((w) => w.id !== id);
    await this._saveWorkouts(filtered);
  },

  async getBenchmarks(): Promise<Benchmark[]> {
    return this._getBenchmarks();
  },

  async saveBenchmark(benchmark: Benchmark): Promise<void> {
    const benchmarks = await this._getBenchmarks();
    const index = benchmarks.findIndex((b) => b.id === benchmark.id);
    if (index !== -1) {
      benchmarks[index] = benchmark;
    } else {
      benchmarks.push(benchmark);
    }
    await this._saveBenchmarks(benchmarks);
  },

  async deleteBenchmark(id: string): Promise<void> {
    const benchmarks = await this._getBenchmarks();
    const filtered = benchmarks.filter((b) => b.id !== id);
    await this._saveBenchmarks(filtered);
  },

  async getBenchmarkTypes(): Promise<BenchmarkTypeDef[]> {
    return this._getBenchmarkTypes();
  },

  async saveBenchmarkTypes(types: BenchmarkTypeDef[]): Promise<void> {
    await this._saveBenchmarkTypes(types);
  },

  async getAnalyticsCategories(): Promise<AnalyticsCategory[]> {
    return this._getAnalyticsCategories();
  },

  async saveAnalyticsCategories(categories: AnalyticsCategory[]): Promise<void> {
    await this._saveAnalyticsCategories(categories);
  },

  async getDailyReadiness(): Promise<any[]> {
    return this._getDailyReadiness();
  },

  async saveDailyReadiness(readiness: any): Promise<void> {
    const all = await this._getDailyReadiness();
    const index = all.findIndex((r) => r.date === readiness.date);
    if (index !== -1) {
      all[index] = readiness;
    } else {
      all.push(readiness);
    }
    await this._saveDailyReadiness(all);
  },

  async getPeriodization(): Promise<PeriodizationWeek[]> {
    return this._getPeriodization();
  },

  async markWeekAsCustomized(weekId: string): Promise<void> {
    const periodization = await this._getPeriodization();
    const week = periodization.find((p) => p.weekId === weekId);
    if (week && !week.customized) {
      week.customized = true;
      await this._savePeriodization(periodization);
    }
  },

  async savePeriodizationWeek(week: PeriodizationWeek): Promise<void> {
    const periodization = await this._getPeriodization();
    const index = periodization.findIndex((p) => p.weekId === week.weekId);
    if (index !== -1) {
      periodization[index] = week;
    } else {
      periodization.push(week);
    }
    await this._savePeriodization(periodization);
  },

  async getTemplates(): Promise<Record<PhaseType, Partial<Workout>[]>> {
    return this._getTemplates();
  },

  async saveTemplates(
    templates: Record<PhaseType, Partial<Workout>[]>,
  ): Promise<void> {
    await this._saveTemplates(templates);
  },

  async resetTemplates(): Promise<void> {
    await this._saveTemplates(DEFAULT_TEMPLATES);
  },

  async getExerciseTypes(): Promise<ExerciseTypeDef[]> {
    return this._getExerciseTypes();
  },

  async saveExerciseTypes(types: ExerciseTypeDef[]): Promise<void> {
    const oldTypes = await this.getExerciseTypes();

    // Prevent duplicate names
    const names = types.map((t) => t.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new Error("Duplicate modality names are not allowed.");
    }

    const renames = new Map<string, string>();
    types.forEach((newType) => {
      const oldType = oldTypes.find((t) => t.id === newType.id);
      if (oldType && oldType.name !== newType.name) {
        renames.set(oldType.name, newType.name);
      }
    });

    await this._saveExerciseTypes(types);

    if (renames.size > 0) {
      const workouts = await this._getWorkouts();
      let workoutsChanged = false;
      workouts.forEach((w) => {
        w.exercises.forEach((e) => {
          if (renames.has(e.type)) {
            e.type = renames.get(e.type)!;
            workoutsChanged = true;
          }
        });
      });
      if (workoutsChanged) await this._saveWorkouts(workouts);

      const templates = await this.getTemplates();
      let templatesChanged = false;
      Object.entries(templates).forEach(([_, phaseTemplates]) => {
        phaseTemplates.forEach((t) => {
          t.exercises?.forEach((e) => {
            if (renames.has(e.type)) {
              e.type = renames.get(e.type)!;
              templatesChanged = true;
            }
          });
        });
      });
      if (templatesChanged) await this.saveTemplates(templates);
    }
  },

  async assignPhaseToWeek(weekId: string, phase: PhaseType): Promise<void> {
    const periodization = await this._getPeriodization();
    const existingIndex = periodization.findIndex((p) => p.weekId === weekId);

    let isCustomized = false;
    if (existingIndex !== -1) {
      isCustomized = !!periodization[existingIndex].customized;
      periodization[existingIndex].phase = phase;
    } else {
      periodization.push({ weekId, phase });
    }
    await this._savePeriodization(periodization);

    if (!isCustomized) {
      const workouts = await this._getWorkouts();
      const filteredWorkouts = workouts.filter(
        (w) => !(w.weekId === weekId && w.status === "planned"),
      );
      const templates = await this.getTemplates();
      const phaseTemplates = templates[phase];

      const newWorkouts: Workout[] = phaseTemplates.map((t, i) => ({
        id: generateId(),
        status: "planned",
        date: null,
        dayOfWeek: t.dayOfWeek,
        weekId,
        notes: t.notes || "",
        loadFactor: 0,
        plannedLoad: t.exercises?.reduce((acc, e) => acc + calculatePlannedLoad(e), 0) || 0,
        exercises: t.exercises || [],
      }));

      await this._saveWorkouts([...filteredWorkouts, ...newWorkouts]);
    }
  },

  async clearWeekData(weekId: string): Promise<void> {
    // 1. Remove periodization entry
    const periodization = await this._getPeriodization();
    const filteredPeriodization = periodization.filter((p) => p.weekId !== weekId);
    await this._savePeriodization(filteredPeriodization);

    // 2. Remove all workouts for this week
    const workouts = await this._getWorkouts();
    const filteredWorkouts = workouts.filter((w) => w.weekId !== weekId);
    await this._saveWorkouts(filteredWorkouts);

    // 3. Remove all benchmarks for this week
    const benchmarks = await this._getBenchmarks();
    const filteredBenchmarks = benchmarks.filter((b) => b.weekId !== weekId);
    await this._saveBenchmarks(filteredBenchmarks);
  },

  async exportData(): Promise<void> {
    await initDB();
    const data = {
      ..._dbState,
      exportVersion: DATA_EXPORT_VERSION,
    };

    const fileName = `climbing-tracker-backup-${new Date().toISOString().split("T")[0]}.json`;
    const jsonString = JSON.stringify(data, null, 2);

    if (Capacitor.isNativePlatform()) {
      try {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: jsonString,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });

        await Share.share({
          title: "Export Training Data",
          text: "Backup of your climbing tracker data",
          url: result.uri,
          dialogTitle: "Save or Share Data",
        });
      } catch (err) {
        console.error("Native export failed:", err);
        throw new Error("Failed to export data to device storage.");
      }
    } else {
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  },

  async importData(file: File): Promise<void> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const content = e.target?.result as string;
          const data = JSON.parse(content);

          if (!data.workouts || !Array.isArray(data.workouts)) {
            throw new Error("Invalid backup format: workouts missing.");
          }

          runDataMigrations(data);

          if (data.workouts) _dbState.workouts = data.workouts;
          if (data.periodization) _dbState.periodization = data.periodization;
          if (data.templates) _dbState.templates = data.templates;
          if (data.exerciseTypes) _dbState.exerciseTypes = data.exerciseTypes;
          if (data.benchmarks) _dbState.benchmarks = data.benchmarks;
          if (data.benchmarkTypes) _dbState.benchmarkTypes = data.benchmarkTypes;
          if (data.analyticsCategories) _dbState.analyticsCategories = data.analyticsCategories;
          _dbState.exportVersion = data.exportVersion || "1.0";
          
          await flushDB();
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  },
};

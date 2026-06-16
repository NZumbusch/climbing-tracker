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
} from "./types";
import { calculatePlannedLoad } from "./types";
import {
  DEFAULT_TEMPLATES,
  DEFAULT_EXERCISE_TYPES,
  DEFAULT_BENCHMARK_TYPES,
  DATA_EXPORT_VERSION,
} from "./constants";
import { generateId } from "./utils";

localforage.config({
  name: "boulder-tracker",
  storeName: "training_data_v2",
});

// --- Migration Helper ---

/**
 * Handles sequential schema migrations for imported data.
 * Adheres strictly to the migration protocol defined in GEMINI.md.
 * @param data The raw JSON data parsed from the backup file
 */
function runDataMigrations(data: any): void {
  let importVersion = data.exportVersion || "1.0";

  // Migration: pre-2.1 -> 2.1 (Added benchmarks and benchmarkTypes)
  if (
    !data.exportVersion ||
    importVersion === "2.0" ||
    importVersion === "1.0"
  ) {
    data.benchmarks = data.benchmarks || [];
    data.benchmarkTypes = data.benchmarkTypes || DEFAULT_BENCHMARK_TYPES;
    importVersion = "2.1";
  }

  // Migration: 2.1 -> 2.2 (Renamed fields, added climbingStyle/boardType)
  if (importVersion === "2.1") {
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
    importVersion = "2.2";
  }

  // Migration: 2.2 -> 2.3 (Added plannedLoad and timeOn/Off)
  if (importVersion === "2.2") {
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

    importVersion = "2.3";
  }

  // Migration: 2.3 -> 2.4 (Added reps and distance)
  if (importVersion === "2.3") {
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

    importVersion = "2.4";
  }

  // Migration: 2.4 -> 2.5 (Fixed plannedLoad calculation formula)
  if (importVersion === "2.4") {
    data.workouts?.forEach((w: any) => {
      if (w.exercises) {
        w.plannedLoad = w.exercises.reduce(
          (acc: number, e: any) => acc + calculatePlannedLoad(e.duration, e.plannedLoad),
          0,
        );
      }
    });

    if (data.templates) {
      Object.values(data.templates).forEach((phase: any) =>
        phase?.forEach((t: any) => {
          if (t.exercises) {
             t.plannedLoad = t.exercises.reduce(
              (acc: number, e: any) => acc + calculatePlannedLoad(e.duration, e.plannedLoad),
              0,
            );
          }
        }),
      );
    }
    importVersion = "2.5";
  }

  // Migration: 2.5 -> 2.6 (Force recalculation of plannedLoad to fix potential "0" string issues and ensure consistency)
  if (importVersion === "2.5") {
    data.workouts?.forEach((w: any) => {
      if (w.exercises && w.exercises.length > 0) {
        w.plannedLoad = w.exercises.reduce(
          (acc: number, e: any) => acc + calculatePlannedLoad(e.duration, e.plannedLoad),
          0,
        );
      }
    });

    if (data.templates) {
      Object.values(data.templates).forEach((phase: any) =>
        phase?.forEach((t: any) => {
          if (t.exercises && t.exercises.length > 0) {
            t.plannedLoad = t.exercises.reduce(
              (acc: number, e: any) => acc + calculatePlannedLoad(e.duration, e.plannedLoad),
              0,
            );
          }
        }),
      );
    }
    importVersion = "2.6";
  }

  // Migration: 2.6 -> 2.7 (Convert all IDs to strings for future UUID support)
  if (importVersion === "2.6") {
    data.workouts?.forEach((w: any) => {
      w.id = String(w.id);
      w.exercises?.forEach((e: any) => {
        e.id = String(e.id);
      });
    });
    data.benchmarks?.forEach((b: any) => {
      b.id = String(b.id);
    });
    importVersion = "2.7";
  }

  // Migration: 2.7 -> 2.8 (Add Fingers category)
  if (importVersion === "2.7") {
    if (data.exerciseTypes) {
      data.exerciseTypes.forEach((t: any) => {
        if (t.id === "max-hangs") {
          t.category = "Fingers";
        }
      });
    }
    importVersion = "2.8";
  }
}

/**
 * Storage singleton providing a clean interface for data persistence.
 */
export const storage = {
  // --- Private Helpers ---

  async _getWorkouts(): Promise<Workout[]> {
    return (await localforage.getItem<Workout[]>("workouts")) || [];
  },

  async _getPeriodization(): Promise<PeriodizationWeek[]> {
    return (
      (await localforage.getItem<PeriodizationWeek[]>("periodization")) || []
    );
  },

  async _getBenchmarks(): Promise<Benchmark[]> {
    return (await localforage.getItem<Benchmark[]>("benchmarks")) || [];
  },

  async _getBenchmarkTypes(): Promise<BenchmarkTypeDef[]> {
    return (
      (await localforage.getItem<BenchmarkTypeDef[]>("benchmarkTypes")) ||
      DEFAULT_BENCHMARK_TYPES
    );
  },

  async _saveWorkouts(workouts: Workout[]): Promise<void> {
    await localforage.setItem("workouts", workouts);
  },

  async _savePeriodization(periodization: PeriodizationWeek[]): Promise<void> {
    await localforage.setItem("periodization", periodization);
  },

  async _saveBenchmarks(benchmarks: Benchmark[]): Promise<void> {
    await localforage.setItem("benchmarks", benchmarks);
  },

  async _saveBenchmarkTypes(types: BenchmarkTypeDef[]): Promise<void> {
    await localforage.setItem("benchmarkTypes", types);
  },

  // --- Public Interface ---

  /**
   * Runs migrations on the local database to ensure it matches the current schema.
   */
  async runStartupMigrations(): Promise<void> {
    const currentVersion = (await localforage.getItem<string>("database_version")) || "1.0";
    
    if (currentVersion === DATA_EXPORT_VERSION) return;

    // Build a TrainingData-like object from local storage
    const data = {
      workouts: await this.getWorkouts(),
      periodization: await this.getPeriodization(),
      templates: await this.getTemplates(),
      exerciseTypes: await this.getExerciseTypes(),
      benchmarks: await this.getBenchmarks(),
      benchmarkTypes: await this.getBenchmarkTypes(),
      exportVersion: currentVersion
    };

    runDataMigrations(data);

    // Save migrated data back to local storage
    if (data.workouts) await this._saveWorkouts(data.workouts);
    if (data.periodization) await this._savePeriodization(data.periodization);
    if (data.templates) await this.saveTemplates(data.templates);
    if (data.exerciseTypes) await this.saveExerciseTypes(data.exerciseTypes);
    if (data.benchmarks) await this._saveBenchmarks(data.benchmarks);
    if (data.benchmarkTypes) await this._saveBenchmarkTypes(data.benchmarkTypes);

    await localforage.setItem("database_version", DATA_EXPORT_VERSION);
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
    return (
      (await localforage.getItem<Record<PhaseType, Partial<Workout>[]>>(
        "templates",
      )) || DEFAULT_TEMPLATES
    );
  },

  async saveTemplates(
    templates: Record<PhaseType, Partial<Workout>[]>,
  ): Promise<void> {
    await localforage.setItem("templates", templates);
  },

  async resetTemplates(): Promise<void> {
    await localforage.setItem("templates", DEFAULT_TEMPLATES);
  },

  async getExerciseTypes(): Promise<ExerciseTypeDef[]> {
    return (
      (await localforage.getItem<ExerciseTypeDef[]>("exerciseTypes")) ||
      DEFAULT_EXERCISE_TYPES
    );
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

    await localforage.setItem("exerciseTypes", types);

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
        plannedLoad: t.exercises?.reduce((acc, e) => acc + calculatePlannedLoad(e.duration, e.plannedLoad), 0) || 0,
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
    const data = {
      workouts: await this.getWorkouts(),
      periodization: await this.getPeriodization(),
      templates: await this.getTemplates(),
      exerciseTypes: await this.getExerciseTypes(),
      benchmarks: await this.getBenchmarks(),
      benchmarkTypes: await this.getBenchmarkTypes(),
      exportVersion: DATA_EXPORT_VERSION,
    };

    const fileName = `boulder-tracker-backup-${new Date().toISOString().split("T")[0]}.json`;
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
          text: "Backup of your boulder tracker data",
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

          if (data.workouts)
            await localforage.setItem("workouts", data.workouts);
          if (data.periodization)
            await localforage.setItem("periodization", data.periodization);
          if (data.templates)
            await localforage.setItem("templates", data.templates);
          if (data.exerciseTypes)
            await localforage.setItem("exerciseTypes", data.exerciseTypes);
          if (data.benchmarks)
            await localforage.setItem("benchmarks", data.benchmarks);
          if (data.benchmarkTypes)
            await localforage.setItem("benchmarkTypes", data.benchmarkTypes);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      reader.readAsText(file);
    });
  },
};

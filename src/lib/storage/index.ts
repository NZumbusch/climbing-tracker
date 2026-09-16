import { Share } from "@capacitor/share";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import type {
  Workout,
  WorkoutTemplate,
  TrainingBlock,
  WeekOverride,
  CompetitionEvent,
  ExerciseTypeDef,
  PhaseDef,
  Benchmark,
  BenchmarkTypeDef,
  AnalyticsCategory,
  MetricDef,
  DailyMetricEntry,
  PainLog,
} from "../types";
import { calculatePlannedLoad } from "../types";
import { DEFAULT_TEMPLATES, DATA_EXPORT_VERSION } from "../constants";
import { generateId, showAlert } from "../utils";
import { generateWorkoutsFromTemplate } from "../planning/generateWorkoutsFromTemplate";
import { getDominantBlockForWeek } from "../planning/trainingBlocks";
import { initDB, flushDB, setDbState, writeMigrationBackup, _dbState } from "./persistence";
import { runDataMigrations, assertMigrationInvariants } from "./migrations";

export { runDataMigrations, assertMigrationInvariants };

/**
 * Storage singleton providing a clean interface for data persistence.
 */
export const storage = {
  // --- Private Helpers ---

  async _getWorkouts(): Promise<Workout[]> { await initDB(); return _dbState.workouts; },
  async _getTrainingBlocks(): Promise<TrainingBlock[]> { await initDB(); return _dbState.trainingBlocks; },
  async _getWeekOverrides(): Promise<WeekOverride[]> { await initDB(); return _dbState.weekOverrides; },
  async _getCompetitionEvents(): Promise<CompetitionEvent[]> { await initDB(); return _dbState.competitionEvents; },
  async _getBenchmarks(): Promise<Benchmark[]> { await initDB(); return _dbState.benchmarks; },
  async _getBenchmarkTypes(): Promise<BenchmarkTypeDef[]> { await initDB(); return _dbState.benchmarkTypes; },
  async _getAnalyticsCategories(): Promise<AnalyticsCategory[]> { await initDB(); return _dbState.analyticsCategories; },
  async _getTemplates(): Promise<Record<string, WorkoutTemplate[]>> { await initDB(); return _dbState.templates; },
  async _getPhaseDefs(): Promise<PhaseDef[]> { await initDB(); return _dbState.phaseDefs; },
  async _getExerciseTypes(): Promise<ExerciseTypeDef[]> { await initDB(); return _dbState.exerciseTypes; },
  async _getMetricDefs(): Promise<MetricDef[]> { await initDB(); return _dbState.metricDefs; },
  async _getDailyMetrics(): Promise<DailyMetricEntry[]> { await initDB(); return _dbState.dailyMetrics; },
  async _getPainLogs(): Promise<PainLog[]> { await initDB(); return _dbState.painLogs; },

  async _saveWorkouts(workouts: Workout[]): Promise<void> { await initDB(); _dbState.workouts = workouts; await flushDB(); },
  async _saveTrainingBlocks(blocks: TrainingBlock[]): Promise<void> { await initDB(); _dbState.trainingBlocks = blocks; await flushDB(); },
  async _saveWeekOverrides(overrides: WeekOverride[]): Promise<void> { await initDB(); _dbState.weekOverrides = overrides; await flushDB(); },
  async _saveCompetitionEvents(events: CompetitionEvent[]): Promise<void> { await initDB(); _dbState.competitionEvents = events; await flushDB(); },
  async _saveBenchmarks(benchmarks: Benchmark[]): Promise<void> { await initDB(); _dbState.benchmarks = benchmarks; await flushDB(); },
  async _saveBenchmarkTypes(types: BenchmarkTypeDef[]): Promise<void> { await initDB(); _dbState.benchmarkTypes = types; await flushDB(); },
  async _saveAnalyticsCategories(categories: AnalyticsCategory[]): Promise<void> { await initDB(); _dbState.analyticsCategories = categories; await flushDB(); },
  async _saveTemplates(templates: Record<string, WorkoutTemplate[]>): Promise<void> { await initDB(); _dbState.templates = templates; await flushDB(); },
  async _savePhaseDefs(defs: PhaseDef[]): Promise<void> { await initDB(); _dbState.phaseDefs = defs; await flushDB(); },
  async _saveExerciseTypes(types: ExerciseTypeDef[]): Promise<void> { await initDB(); _dbState.exerciseTypes = types; await flushDB(); },
  async _saveMetricDefs(defs: MetricDef[]): Promise<void> { await initDB(); _dbState.metricDefs = defs; await flushDB(); },
  async _saveDailyMetrics(entries: DailyMetricEntry[]): Promise<void> { await initDB(); _dbState.dailyMetrics = entries; await flushDB(); },
  async _savePainLogs(logs: PainLog[]): Promise<void> { await initDB(); _dbState.painLogs = logs; await flushDB(); },

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
      setDbState(before);
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

  async getTrainingBlocks(): Promise<TrainingBlock[]> {
    return this._getTrainingBlocks();
  },

  async saveTrainingBlock(block: TrainingBlock): Promise<void> {
    const blocks = await this._getTrainingBlocks();
    const index = blocks.findIndex((b) => b.id === block.id);
    if (index !== -1) {
      blocks[index] = block;
    } else {
      blocks.push(block);
    }
    await this._saveTrainingBlocks(blocks);
  },

  async deleteTrainingBlock(id: string): Promise<void> {
    const blocks = await this._getTrainingBlocks();
    await this._saveTrainingBlocks(blocks.filter((b) => b.id !== id));
  },

  async getWeekOverrides(): Promise<WeekOverride[]> {
    return this._getWeekOverrides();
  },

  async markWeekAsCustomized(weekId: string): Promise<void> {
    const overrides = await this._getWeekOverrides();
    const existing = overrides.find((o) => o.weekId === weekId);
    if (existing) {
      if (!existing.customized) {
        existing.customized = true;
        await this._saveWeekOverrides(overrides);
      }
    } else {
      overrides.push({ weekId, customized: true });
      await this._saveWeekOverrides(overrides);
    }
  },

  async getCompetitionEvents(): Promise<CompetitionEvent[]> {
    return this._getCompetitionEvents();
  },

  async saveCompetitionEvent(event: CompetitionEvent): Promise<void> {
    const events = await this._getCompetitionEvents();
    const index = events.findIndex((e) => e.id === event.id);
    if (index !== -1) {
      events[index] = event;
    } else {
      events.push(event);
    }
    await this._saveCompetitionEvents(events);
  },

  async deleteCompetitionEvent(id: string): Promise<void> {
    const events = await this._getCompetitionEvents();
    await this._saveCompetitionEvents(events.filter((e) => e.id !== id));
  },

  async getTemplates(): Promise<Record<string, WorkoutTemplate[]>> {
    return this._getTemplates();
  },

  async saveTemplates(
    templates: Record<string, WorkoutTemplate[]>,
  ): Promise<void> {
    await this._saveTemplates(templates);
  },

  async resetTemplates(): Promise<void> {
    await this._saveTemplates(DEFAULT_TEMPLATES);
  },

  async getPhaseDefs(): Promise<PhaseDef[]> {
    return this._getPhaseDefs();
  },

  async savePhaseDefs(defs: PhaseDef[]): Promise<void> {
    await this._savePhaseDefs(defs);
  },

  async getExerciseTypes(): Promise<ExerciseTypeDef[]> {
    return this._getExerciseTypes();
  },

  async saveExerciseTypes(types: ExerciseTypeDef[]): Promise<void> {
    // Prevent duplicate names
    const names = types.map((t) => t.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) {
      throw new Error("Duplicate modality names are not allowed.");
    }

    // No rename-propagation needed: exercises reference types by typeId
    // (Phase 1), which doesn't change when a type's display name does.
    await this._saveExerciseTypes(types);
  },

  async getMetricDefs(): Promise<MetricDef[]> {
    return this._getMetricDefs();
  },

  async saveMetricDefs(defs: MetricDef[]): Promise<void> {
    await this._saveMetricDefs(defs);
  },

  async getDailyMetrics(): Promise<DailyMetricEntry[]> {
    return this._getDailyMetrics();
  },

  async saveDailyMetrics(entries: DailyMetricEntry[]): Promise<void> {
    await this._saveDailyMetrics(entries);
  },

  async getPainLogs(): Promise<PainLog[]> {
    return this._getPainLogs();
  },

  async savePainLogs(logs: PainLog[]): Promise<void> {
    await this._savePainLogs(logs);
  },

  async savePainLog(log: PainLog): Promise<void> {
    const logs = await this._getPainLogs();
    const index = logs.findIndex((l) => l.id === log.id);
    if (index !== -1) {
      logs[index] = log;
    } else {
      logs.push(log);
    }
    await this._savePainLogs(logs);
  },

  async deletePainLog(id: string): Promise<void> {
    const logs = await this._getPainLogs();
    await this._savePainLogs(logs.filter((l) => l.id !== id));
  },

  /**
   * "Quick assign" a phase to a single week - the same interaction the app
   * has always offered, now expressed as a `TrainingBlock` whose range is
   * exactly that one week (`startWeekId === endWeekId === weekId`), so it
   * migrates 1:1 from the old `PeriodizationWeek` shape. Multi-week blocks
   * (real overlapping concurrent training emphases) are created/edited
   * directly via `saveTrainingBlock`, not through this method.
   *
   * If another, higher-priority block already covers this week, that block
   * still wins for template generation/display (see `getDominantBlockForWeek`)
   * - assigning a phase here only ever affects this week's own single-week
   * block, never anyone else's block.
   */
  async assignPhaseToWeek(weekId: string, phaseId: string): Promise<void> {
    const blocks = await this._getTrainingBlocks();
    const overrides = await this._getWeekOverrides();
    const isCustomized = !!overrides.find((o) => o.weekId === weekId)?.customized;

    const existingIndex = blocks.findIndex(
      (b) => b.startWeekId === weekId && b.endWeekId === weekId,
    );
    if (existingIndex !== -1) {
      blocks[existingIndex] = { ...blocks[existingIndex], phaseId };
    } else {
      const phaseDefs = await this._getPhaseDefs();
      const phase = phaseDefs.find((p) => p.id === phaseId);
      blocks.push({
        id: generateId(),
        name: phase?.name || "Training Block",
        phaseId,
        startWeekId: weekId,
        endWeekId: weekId,
      });
    }
    await this._saveTrainingBlocks(blocks);

    if (!isCustomized) {
      const workouts = await this._getWorkouts();
      const filteredWorkouts = workouts.filter(
        (w) => !(w.weekId === weekId && w.status === "planned"),
      );
      const templates = await this.getTemplates();
      const dominantBlock = getDominantBlockForWeek(blocks, weekId);
      const effectivePhaseId = dominantBlock?.phaseId ?? phaseId;
      const phaseTemplates = templates[effectivePhaseId];

      const newWorkouts = generateWorkoutsFromTemplate(weekId, phaseTemplates || []).map(
        (w) => ({ ...w, blockId: dominantBlock?.id }),
      );

      await this._saveWorkouts([...filteredWorkouts, ...newWorkouts]);
    }
  },

  async clearWeekData(weekId: string): Promise<void> {
    // 1. Remove this week's own single-week block (a multi-week block that
    // merely spans this week among others is left alone - clearing one
    // week can't silently delete data for the other weeks it covers).
    const blocks = await this._getTrainingBlocks();
    const filteredBlocks = blocks.filter(
      (b) => !(b.startWeekId === weekId && b.endWeekId === weekId),
    );
    await this._saveTrainingBlocks(filteredBlocks);

    // 2. Remove the week override
    const overrides = await this._getWeekOverrides();
    await this._saveWeekOverrides(overrides.filter((o) => o.weekId !== weekId));

    // 3. Remove all workouts for this week
    const workouts = await this._getWorkouts();
    const filteredWorkouts = workouts.filter((w) => w.weekId !== weekId);
    await this._saveWorkouts(filteredWorkouts);

    // 4. Remove all benchmarks for this week
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
          if (data.trainingBlocks) _dbState.trainingBlocks = data.trainingBlocks;
          if (data.weekOverrides) _dbState.weekOverrides = data.weekOverrides;
          if (data.competitionEvents) _dbState.competitionEvents = data.competitionEvents;
          if (data.templates) _dbState.templates = data.templates;
          if (data.phaseDefs) _dbState.phaseDefs = data.phaseDefs;
          if (data.exerciseTypes) _dbState.exerciseTypes = data.exerciseTypes;
          if (data.benchmarks) _dbState.benchmarks = data.benchmarks;
          if (data.benchmarkTypes) _dbState.benchmarkTypes = data.benchmarkTypes;
          if (data.analyticsCategories) _dbState.analyticsCategories = data.analyticsCategories;
          if (data.metricDefs) _dbState.metricDefs = data.metricDefs;
          if (data.dailyMetrics) _dbState.dailyMetrics = data.dailyMetrics;
          if (data.painLogs) _dbState.painLogs = data.painLogs;
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

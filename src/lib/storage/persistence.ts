import localforage from "localforage";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import {
  DEFAULT_TEMPLATES,
  DEFAULT_EXERCISE_TYPES,
  DEFAULT_BENCHMARK_TYPES,
  DEFAULT_ANALYTICS_CATEGORIES,
  DEFAULT_PHASE_DEFS,
  DATA_EXPORT_VERSION,
} from "../constants";

/**
 * Decides what `exportVersion` a freshly-loaded `_dbState` should carry.
 *
 * Bug fix (found 2026-09-16, reported by the user as duplicate/gray
 * "phase-..." entries surviving a storage wipe): a **true fresh install**
 * (no `workouts` ever persisted - the one field every real install always
 * has, even as `[]`) populates every other field straight from the
 * `DEFAULT_*` constants, which are already in the *current* schema shape by
 * construction. Defaulting `exportVersion` to `"1.0"` in that case (the old
 * behavior) made `runStartupMigrations` run the *entire* migration chain
 * over already-current-shape data - most historical steps happen to be
 * defensive/idempotent against that, but not all of them (confirmed: the
 * Phase 3 templates-rekey step re-resolved already-correct phaseId keys as
 * if they were phase *names*, creating an archived placeholder PhaseDef
 * per phase, and the Phase 1 Exercise->ExerciseSlot restructure step
 * double-nested `prescribed` on already-slotted default-template
 * exercises). A real, pre-existing install (has persisted `workouts`, even
 * an empty array) still defaults to `"1.0"` exactly as before when its
 * `exportVersion` is missing - that's the genuine 1.0/2.0-era case
 * migrations exist to handle.
 */
export function resolveInitialExportVersion(rawData: { workouts?: unknown; exportVersion?: string }): string {
  const isFreshInstall = rawData.workouts == null;
  return isFreshInstall ? DATA_EXPORT_VERSION : (rawData.exportVersion || "1.0");
}

/**
 * Pure get/set of the raw DB blob - the localforage (web) / Capacitor
 * Filesystem (native) adapters, and the in-memory `_dbState` they populate.
 * No domain knowledge (migrations, CRUD semantics) lives here.
 */

localforage.config({
  name: "boulder-tracker",
  storeName: "training_data_v2",
});

export let _dbState: any = null;

export async function initDB() {
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
      trainingBlocks: await localforage.getItem("trainingBlocks"),
      weekOverrides: await localforage.getItem("weekOverrides"),
      competitionEvents: await localforage.getItem("competitionEvents"),
      templates: await localforage.getItem("templates"),
      phaseDefs: await localforage.getItem("phaseDefs"),
      exerciseTypes: await localforage.getItem("exerciseTypes"),
      benchmarks: await localforage.getItem("benchmarks"),
      benchmarkTypes: await localforage.getItem("benchmarkTypes"),
      analyticsCategories: await localforage.getItem("analyticsCategories"),
      metricDefs: await localforage.getItem("metricDefs"),
      dailyMetrics: await localforage.getItem("dailyMetrics"),
      painLogs: await localforage.getItem("painLogs"),
      exportVersion: await localforage.getItem("database_version"),
    };
  }

  _dbState = {
    workouts: rawData.workouts || [],
    trainingBlocks: rawData.trainingBlocks || [],
    weekOverrides: rawData.weekOverrides || [],
    competitionEvents: rawData.competitionEvents || [],
    templates: rawData.templates || DEFAULT_TEMPLATES,
    phaseDefs: rawData.phaseDefs || DEFAULT_PHASE_DEFS,
    exerciseTypes: rawData.exerciseTypes || DEFAULT_EXERCISE_TYPES,
    benchmarks: rawData.benchmarks || [],
    benchmarkTypes: rawData.benchmarkTypes || DEFAULT_BENCHMARK_TYPES,
    analyticsCategories: rawData.analyticsCategories || DEFAULT_ANALYTICS_CATEGORIES,
    metricDefs: rawData.metricDefs || [],
    dailyMetrics: rawData.dailyMetrics || [],
    painLogs: rawData.painLogs || [],
    exportVersion: resolveInitialExportVersion(rawData),
  };
}

export function setDbState(next: any) {
  _dbState = next;
}

export async function flushDB() {
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
    await localforage.setItem("trainingBlocks", _dbState.trainingBlocks);
    await localforage.setItem("weekOverrides", _dbState.weekOverrides);
    await localforage.setItem("competitionEvents", _dbState.competitionEvents);
    await localforage.setItem("templates", _dbState.templates);
    await localforage.setItem("phaseDefs", _dbState.phaseDefs);
    await localforage.setItem("exerciseTypes", _dbState.exerciseTypes);
    await localforage.setItem("benchmarks", _dbState.benchmarks);
    await localforage.setItem("benchmarkTypes", _dbState.benchmarkTypes);
    await localforage.setItem("analyticsCategories", _dbState.analyticsCategories);
    await localforage.setItem("metricDefs", _dbState.metricDefs);
    await localforage.setItem("dailyMetrics", _dbState.dailyMetrics);
    await localforage.setItem("painLogs", _dbState.painLogs);
    await localforage.setItem("database_version", _dbState.exportVersion);
  }
}

// Single fixed key/filename so a new backup always overwrites the previous
// one rather than accumulating - the version the backup was taken from is
// stored inside the payload itself instead of the key name.
const MIGRATION_BACKUP_KEY = "backup_pre_migration";
const MIGRATION_BACKUP_FILE = "boulder_tracker_db.backup.json";

export async function writeMigrationBackup(fromVersion: string, data: any): Promise<void> {
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

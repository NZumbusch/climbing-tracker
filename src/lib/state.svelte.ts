import { storage } from './storage';
import type { Workout, WorkoutTemplate, PhaseDef, Benchmark, BenchmarkTypeDef, AnalyticsCategory, ExerciseTypeDef, ViewType, TrainingBlock, CompetitionEvent, PainLog } from './types';
import { getWeekId } from './dateUtils';
import { showAlert, showConfirm } from './utils';
import { WorkoutStore } from './stores/workoutStore.svelte';
import { PlanningStore } from './stores/planningStore.svelte';
import { CatalogStore } from './stores/catalogStore.svelte';
import { BenchmarkStore } from './stores/benchmarkStore.svelte';
import { MetricsStore } from './stores/metricsStore.svelte';
import { UiStore } from './stores/uiStore.svelte';
import { BackupStore } from './stores/backupStore.svelte';

/**
 * Global reactive state for the application, composed from the domain
 * stores in `src/lib/stores/`. This facade preserves the pre-Phase-2
 * public API (same property/method names on `trainingState`) so the
 * many existing component call sites don't need to change - the domain
 * stores are the real decomposition, this is a thin compatibility layer
 * over them (see PLAN.md Phase 2 / PROGRESS.md 2026-09-16).
 */
class TrainingState {
  workoutStore = new WorkoutStore();
  planningStore = new PlanningStore();
  catalogStore = new CatalogStore();
  benchmarkStore = new BenchmarkStore();
  metricsStore = new MetricsStore();
  uiStore = new UiStore();
  backupStore = new BackupStore();

  isLoading = $state(true);

  constructor() {
    this.refresh();
  }

  // --- Delegated data state (read-only from outside; mutated via actions) ---

  get workouts() { return this.workoutStore.workouts; }
  get trainingBlocks() { return this.planningStore.trainingBlocks; }
  get weekOverrides() { return this.planningStore.weekOverrides; }
  get competitionEvents() { return this.planningStore.competitionEvents; }
  get templates() { return this.planningStore.templates; }
  get exerciseTypes() { return this.catalogStore.exerciseTypes; }
  get analyticsCategories() { return this.catalogStore.analyticsCategories; }
  get benchmarkTypes() { return this.catalogStore.benchmarkTypes; }
  get phaseDefs() { return this.catalogStore.phaseDefs; }
  get benchmarks() { return this.benchmarkStore.benchmarks; }
  get metricDefs() { return this.metricsStore.metricDefs; }
  get dailyMetrics() { return this.metricsStore.dailyMetrics; }
  get painLogs() { return this.metricsStore.painLogs; }

  // --- Delegated UI state ---

  get view() { return this.uiStore.view; }
  get activeWorkout() { return this.uiStore.activeWorkout; }
  get showFatigue() { return this.uiStore.showFatigue; }
  get theme() { return this.uiStore.theme; }

  get selectedWeekId() { return this.uiStore.selectedWeekId; }
  set selectedWeekId(value: string | null) { this.uiStore.selectedWeekId = value; }

  get weekOffset() { return this.uiStore.weekOffset; }
  set weekOffset(value: number) { this.uiStore.weekOffset = value; }

  /**
   * Refreshes all data from storage.
   */
  async refresh() {
    this.isLoading = true;
    try {
      // Run migrations on the local database before loading
      await storage.runStartupMigrations();

      await Promise.all([
        this.workoutStore.load(),
        this.planningStore.load(),
        this.catalogStore.load(),
        this.benchmarkStore.load(),
        this.metricsStore.load(),
      ]);
    } finally {
      this.isLoading = false;
    }
  }

  // --- Derived State ---

  get currentWeekId() {
    return getWeekId(new Date());
  }

  get completedWorkouts() {
    return this.workoutStore.completedWorkouts;
  }

  getPlannedWorkoutsForWeek(weekId: string) {
    return this.workoutStore.getPlannedWorkoutsForWeek(weekId);
  }

  getBlocksForWeek(weekId: string) {
    return this.planningStore.getBlocksForWeek(weekId);
  }

  getDominantBlockForWeek(weekId: string) {
    return this.planningStore.getDominantBlockForWeek(weekId);
  }

  isWeekCustomized(weekId: string) {
    return this.planningStore.isWeekCustomized(weekId);
  }

  getBenchmarksForWeek(weekId: string) {
    return this.benchmarkStore.getBenchmarksForWeek(weekId);
  }

  // --- Actions ---

  /**
   * Navigates to a specific view and optionally sets an active workout.
   */
  navigate(view: ViewType, workout: Workout | null = null) {
    this.uiStore.navigate(view, workout);
  }

  /**
   * Opens the fatigue rating modal for a specific workout.
   */
  openFatigueModal(workout: Workout) {
    this.uiStore.openFatigueModal(workout);
  }

  /**
   * Closes the fatigue modal and clears active workout.
   */
  closeFatigueModal() {
    this.uiStore.closeFatigueModal();
  }

  /**
   * Completes a workout by applying fatigue data and saving to storage.
   */
  async confirmFatigue(fatigueData: Partial<Workout>) {
    if (!this.activeWorkout) return;

    const completedWorkout: Workout = {
      ...this.activeWorkout,
      ...fatigueData,
      status: 'completed',
      date: this.activeWorkout.date || new Date().toISOString()
    };

    await this.saveWorkout(completedWorkout);
    this.navigate('history');
  }

  // --- Backup Actions ---

  /**
   * Updates the theme mode and persists to localStorage
   */
  setTheme(newTheme: 'dark' | 'light' | 'contrast') {
    this.uiStore.setTheme(newTheme);
  }

  /**
   * Exports all training data to a JSON file.
   */
  async exportData() {
    await this.backupStore.exportData();
  }

  /**
   * Imports training data from a JSON file.
   */
  async importData(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      await this.backupStore.importFile(file);
      await this.refresh();
      await showAlert('Import Success', 'Data imported successfully!');
      this.navigate('history');
    } catch (err) {
      await showAlert('Import Error', 'Failed to import data. Please check the file format.');
    }
  }

  /**
   * Exports all training data to a CSV file for analysis in Excel or Python.
   */
  async exportToCSV() {
    this.backupStore.exportToCSV(this.workouts, this.trainingBlocks, this.exerciseTypes, this.phaseDefs);
  }

  /**
   * Saves a workout to storage and refreshes local state.
   */
  async saveWorkout(workout: Workout) {
    await this.workoutStore.saveWorkout(workout);
    await this.refresh();
  }

  /**
   * Handles the high-level logic of saving a workout, including modal triggers.
   */
  async processWorkoutSave(workout: Workout) {
    if (workout.status === 'completed') {
      this.openFatigueModal(workout);
    } else {
      await this.saveWorkout(workout);
      this.navigate('plan');
    }
  }

  /**
   * Deletes a workout from storage after confirmation.
   */
  async deleteWorkout(id: string) {
    const confirmed = await showConfirm('Delete Workout', 'Are you sure you want to delete this workout?');
    if (!confirmed) return;
    await this.workoutStore.deleteWorkout(id);
    await this.refresh();
  }

  /**
   * Duplicates an existing workout.
   */
  async duplicateWorkout(workout: Workout) {
    await this.workoutStore.duplicateWorkout(workout);
    await this.refresh();
  }

  /**
   * Saves a benchmark to storage and refreshes local state.
   */
  async saveBenchmark(benchmark: Benchmark) {
    await this.benchmarkStore.saveBenchmark(benchmark);
    await this.refresh();
  }

  /**
   * Deletes a benchmark from storage after confirmation.
   */
  async deleteBenchmark(id: string) {
    const confirmed = await showConfirm('Delete Benchmark', 'Are you sure you want to delete this benchmark?');
    if (!confirmed) return;
    await this.benchmarkStore.deleteBenchmark(id);
    await this.refresh();
  }

  /**
   * Resets a week by removing its phase assignment and all workouts.
   */
  async clearWeek(weekId: string) {
    const confirmed = await showConfirm('Clear Week', `Are you sure you want to clear all data for ${weekId}? This will delete all workouts and benchmarks for this week.`);
    if (!confirmed) return;

    try {
      await this.planningStore.clearWeek(weekId);
      await this.refresh();
    } catch (err) {
      console.error("Failed to clear week:", err);
      await showAlert('Error', "Failed to clear week data.");
    }
  }

  /**
   * Updates the global list of benchmark test types.
   */
  async updateBenchmarkTypes(types: BenchmarkTypeDef[]) {
    await this.catalogStore.updateBenchmarkTypes(types);
    await this.refresh();
  }

  /**
   * Updates the global list of macrocycle phase definitions.
   */
  async updatePhaseDefs(defs: PhaseDef[]) {
    await this.catalogStore.updatePhaseDefs(defs);
    await this.refresh();
  }

  /**
   * Assigns a training phase to a specific week.
   */
  async assignPhase(weekId: string, phaseId: string) {
    await this.planningStore.assignPhase(weekId, phaseId);
    await this.refresh();
  }

  /**
   * Creates or updates a (possibly multi-week) training block.
   */
  async saveTrainingBlock(block: TrainingBlock) {
    await this.planningStore.saveTrainingBlock(block);
    await this.refresh();
  }

  /**
   * Deletes a training block after confirmation.
   */
  async deleteTrainingBlock(id: string) {
    const confirmed = await showConfirm('Delete Training Block', 'Delete this training block? Any weeks only covered by it will show no phase.');
    if (!confirmed) return;
    await this.planningStore.deleteTrainingBlock(id);
    await this.refresh();
  }

  /**
   * Creates or updates a competition/event on the peaking calendar.
   */
  async saveCompetitionEvent(event: CompetitionEvent) {
    await this.planningStore.saveCompetitionEvent(event);
    await this.refresh();
  }

  /**
   * Deletes a competition/event after confirmation.
   */
  async deleteCompetitionEvent(id: string) {
    const confirmed = await showConfirm('Delete Event', 'Delete this competition/event?');
    if (!confirmed) return;
    await this.planningStore.deleteCompetitionEvent(id);
    await this.refresh();
  }

  /**
   * Logs a pain/discomfort entry.
   */
  async savePainLog(log: PainLog) {
    await this.metricsStore.savePainLog(log);
    await this.refresh();
  }

  /**
   * Deletes a pain/discomfort log entry after confirmation.
   */
  async deletePainLog(id: string) {
    const confirmed = await showConfirm('Delete Log', 'Delete this pain/discomfort log entry?');
    if (!confirmed) return;
    await this.metricsStore.deletePainLog(id);
    await this.refresh();
  }

  /**
   * Updates the global list of analytics categories.
   */
  async updateAnalyticsCategories(categories: AnalyticsCategory[]) {
    await this.catalogStore.updateAnalyticsCategories(categories);
    await this.refresh();
  }

  /**
   * Updates the global list of exercise modalities.
   */
  async updateExerciseTypes(types: ExerciseTypeDef[]) {
    await this.catalogStore.updateExerciseTypes(types);
    await this.refresh();
  }

  /**
   * Updates workout templates for different phases.
   */
  async updateTemplates(templates: Record<string, WorkoutTemplate[]>) {
    await this.planningStore.updateTemplates(templates);
    await this.refresh();
  }

  /**
   * Resets templates to their default values.
   */
  async resetTemplates() {
    await this.planningStore.resetTemplates();
    await this.refresh();
  }
}

export const trainingState = new TrainingState();

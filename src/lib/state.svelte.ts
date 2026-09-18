import { storage } from './storage';
import type { Workout, WorkoutTemplate, PhaseDef, Benchmark, BenchmarkTypeDef, AnalyticsCategory, ExerciseTypeDef, ViewType, TrainingBlock, CompetitionEvent, PainLog, DailyMetricEntry, MetricDef, OutdoorAscent } from './types';
import { getWeekId } from './dateUtils';
import { showAlert, showConfirm } from './utils';
import { WorkoutStore } from './stores/workoutStore.svelte';
import { PlanningStore } from './stores/planningStore.svelte';
import { CatalogStore } from './stores/catalogStore.svelte';
import { BenchmarkStore } from './stores/benchmarkStore.svelte';
import { MetricsStore } from './stores/metricsStore.svelte';
import { OutdoorAscentStore } from './stores/outdoorAscentStore.svelte';
import { UiStore } from './stores/uiStore.svelte';
import { BackupStore } from './stores/backupStore.svelte';
import { PreferencesStore } from './stores/preferencesStore.svelte';
import { WeatherStore } from './stores/weatherStore.svelte';
import type { WeatherLocation, FatigueChartStyle, HomeSectionPreference, AISharingPreferences } from './preferences/migrate';
import { geocodeCity } from './weather/api';
import type { TextScale, MotionPreference } from './preferences/migrate';
import { syncFatigueReminders } from './notifications/fatigueReminder';
import { syncDailyMetricsReminder } from './notifications/dailyMetricsReminder';
import { cancelRemindersOfType } from './notifications/shared';

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
  outdoorAscentStore = new OutdoorAscentStore();
  uiStore = new UiStore();
  backupStore = new BackupStore();
  preferencesStore = new PreferencesStore();
  weatherStore = new WeatherStore();

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
  get outdoorAscents() { return this.outdoorAscentStore.outdoorAscents; }

  // --- Delegated UI state ---

  get view() { return this.uiStore.view; }
  get activeWorkout() { return this.uiStore.activeWorkout; }
  get showFatigue() { return this.uiStore.showFatigue; }
  get theme() { return this.uiStore.theme; }
  get notificationsEnabled() { return this.uiStore.notificationsEnabled; }
  get notificationPermission() { return this.uiStore.notificationPermission; }

  get selectedWeekId() { return this.uiStore.selectedWeekId; }
  set selectedWeekId(value: string | null) { this.uiStore.selectedWeekId = value; }

  get weekOffset() { return this.uiStore.weekOffset; }
  set weekOffset(value: number) { this.uiStore.weekOffset = value; }

  get textScale() { return this.preferencesStore.textScale; }
  get motion() { return this.preferencesStore.motion; }
  setTextScale(scale: TextScale) { this.preferencesStore.setTextScale(scale); }
  setMotion(motion: MotionPreference) { this.preferencesStore.setMotion(motion); }

  get dailyMetricsReminderEnabled() { return this.preferencesStore.dailyMetricsReminderEnabled; }
  get dailyMetricsReminderTime() { return this.preferencesStore.dailyMetricsReminderTime; }
  /**
   * Toggling this sub-preference doesn't wait for the next `refresh()` to
   * take effect - disabling cancels any pending daily-metrics reminder
   * immediately (`cancelRemindersOfType`, never touching the fatigue
   * type's own pending notifications), enabling schedules one right away
   * if today's metrics are still missing.
   */
  async setDailyMetricsReminderEnabled(enabled: boolean) {
    this.preferencesStore.setDailyMetricsReminderEnabled(enabled);
    if (enabled) {
      await syncDailyMetricsReminder(this.dailyMetrics, this.dailyMetricsReminderTime);
    } else {
      await cancelRemindersOfType('dailyMetrics');
    }
  }
  /** No-ops if the reminder itself is currently disabled - nothing to reschedule. */
  async setDailyMetricsReminderTime(time: string) {
    this.preferencesStore.setDailyMetricsReminderTime(time);
    if (this.dailyMetricsReminderEnabled) {
      await syncDailyMetricsReminder(this.dailyMetrics, time);
    }
  }

  // --- Weather (UI_PLAN.md §5.5) ---

  get homeLocation() { return this.preferencesStore.homeLocation; }
  get tripLocation() { return this.preferencesStore.tripLocation; }
  get homeWeather() { return this.weatherStore.home; }
  get tripWeather() { return this.weatherStore.trip; }

  /** Sets the home location and immediately fetches for it (or clears the card if `location` is `null`). */
  async setHomeLocation(location: WeatherLocation | null) {
    this.preferencesStore.setHomeLocation(location);
    await this.weatherStore.loadHome(location);
  }

  /** Sets the trip location and immediately fetches for it (or clears the card if `location` is `null`). */
  async setTripLocation(location: WeatherLocation | null) {
    this.preferencesStore.setTripLocation(location);
    await this.weatherStore.loadTrip(location);
  }

  /** Re-fetches whichever locations are currently set - called from Home on mount, not on every `refresh()` (a network call on every save would be excessive for data that changes over hours, not seconds). */
  async refreshWeather() {
    await Promise.all([
      this.weatherStore.loadHome(this.homeLocation),
      this.weatherStore.loadTrip(this.tripLocation),
    ]);
  }

  /** City name -> candidate locations, for the Settings location picker (UI_PLAN.md §10 open question 3 - raw lat/lon entry bypasses this entirely). */
  async geocodeCity(query: string) {
    return geocodeCity(query);
  }

  // --- Fatigue chart style, timer toggles, Home section layout (UI_PLAN.md §4.7) ---

  get fatigueChartStyle() { return this.preferencesStore.fatigueChartStyle; }
  setFatigueChartStyle(style: FatigueChartStyle) { this.preferencesStore.setFatigueChartStyle(style); }

  get timerVibrateEnabled() { return this.preferencesStore.timerVibrateEnabled; }
  get timerBeepEnabled() { return this.preferencesStore.timerBeepEnabled; }
  get timerKeepAwakeEnabled() { return this.preferencesStore.timerKeepAwakeEnabled; }
  setTimerVibrateEnabled(enabled: boolean) { this.preferencesStore.setTimerVibrateEnabled(enabled); }
  setTimerBeepEnabled(enabled: boolean) { this.preferencesStore.setTimerBeepEnabled(enabled); }
  setTimerKeepAwakeEnabled(enabled: boolean) { this.preferencesStore.setTimerKeepAwakeEnabled(enabled); }

  get homeSections() { return this.preferencesStore.homeSections; }
  setHomeSectionVisible(id: HomeSectionPreference['id'], visible: boolean) {
    this.preferencesStore.setHomeSectionVisible(id, visible);
  }
  setHomeSectionOrder(order: HomeSectionPreference['id'][]) {
    this.preferencesStore.setHomeSectionOrder(order);
  }

  // --- AI sharing (UI_PLAN.md §5.8, Stage 10) ---

  get aiSharing() { return this.preferencesStore.aiSharing; }
  setAiSharing(category: keyof AISharingPreferences, enabled: boolean) {
    this.preferencesStore.setAiSharing(category, enabled);
  }

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
        this.outdoorAscentStore.load(),
      ]);

      if (this.uiStore.notificationsEnabled) {
        try {
          await syncFatigueReminders(this.workoutStore.workouts);
        } catch (err) {
          console.error('Failed to sync fatigue-reminder notifications:', err);
        }
        if (this.preferencesStore.dailyMetricsReminderEnabled) {
          try {
            await syncDailyMetricsReminder(this.metricsStore.dailyMetrics, this.preferencesStore.dailyMetricsReminderTime);
          } catch (err) {
            console.error('Failed to sync daily-metrics reminder notification:', err);
          }
        }
      }
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
   * Enables or disables fatigue-log reminder notifications, refreshing
   * scheduled notifications immediately afterward so a toggle takes
   * effect right away rather than waiting for the next unrelated refresh.
   */
  async setNotificationsEnabled(enabled: boolean) {
    const result = await this.uiStore.setNotificationsEnabled(enabled);
    await this.refresh();
    return result;
  }

  /**
   * Shows the one-time first-run prompt asking whether to enable
   * fatigue-log reminders. Safe to call on every app load - it no-ops
   * after the first time (see `UiStore.maybePromptForNotifications`).
   */
  async maybePromptForNotifications() {
    await this.uiStore.maybePromptForNotifications();
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
   * Saves a workout without `refresh()`'s `isLoading` toggle - `App.svelte`
   * swaps its entire view tree while `isLoading` is true, so a full
   * `saveWorkout` briefly unmounts/remounts whatever screen is showing,
   * which reads as the page jumping back to its top. Fine for a save that
   * navigates away anyway (`processWorkoutSave`), but wrong for an in-place
   * edit where the user stays put (e.g. the Plan screen's day-of-week
   * reassignment, `UI_PLAN.md §4.3`) - found and fixed 2026-09-18 after the
   * new day-picker made this pre-existing behaviour newly visible.
   * Reloads only the workouts store (everything a schedule change could
   * plausibly affect) and still re-syncs fatigue-reminder notifications,
   * since those key off `dayOfWeek`/`startTime` (`fatigueReminder.ts`) -
   * the one real side effect of the full `refresh()` a "quiet" save must
   * not silently drop.
   */
  async saveWorkoutQuiet(workout: Workout) {
    await this.workoutStore.saveWorkout(workout);
    await this.workoutStore.load();
    if (this.uiStore.notificationsEnabled) {
      try {
        await syncFatigueReminders(this.workoutStore.workouts);
      } catch (err) {
        console.error('Failed to sync fatigue-reminder notifications:', err);
      }
    }
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
   * Logs (or updates) a daily metric entry, e.g. a bodyweight reading.
   * Ensures the referenced MetricDef exists first - defensive, see
   * PROGRESS.md 2026-09-17 (fresh-install MetricDef seeding gap).
   */
  async saveDailyMetric(entry: DailyMetricEntry, def: MetricDef) {
    await this.metricsStore.ensureMetricDef(def);
    await this.metricsStore.saveDailyMetric(entry);
    await this.refresh();
  }

  /**
   * Deletes a daily metric entry (e.g. a bodyweight reading) after confirmation.
   */
  async deleteDailyMetric(id: string) {
    const confirmed = await showConfirm('Delete Entry', 'Delete this log entry?');
    if (!confirmed) return;
    await this.metricsStore.deleteDailyMetric(id);
    await this.refresh();
  }

  /**
   * Saves (or updates) a single outdoor ascent.
   */
  async saveOutdoorAscent(ascent: OutdoorAscent) {
    await this.outdoorAscentStore.saveOutdoorAscent(ascent);
    await this.refresh();
  }

  /**
   * Appends a batch of outdoor ascents (e.g. from a CSV import) in one write.
   */
  async addOutdoorAscents(ascents: OutdoorAscent[]) {
    await this.outdoorAscentStore.addOutdoorAscents(ascents);
    await this.refresh();
  }

  /**
   * Deletes an outdoor ascent after confirmation.
   */
  async deleteOutdoorAscent(id: string) {
    const confirmed = await showConfirm('Delete Ascent', 'Delete this logged ascent?');
    if (!confirmed) return;
    await this.outdoorAscentStore.deleteOutdoorAscent(id);
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

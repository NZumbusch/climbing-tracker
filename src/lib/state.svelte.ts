import { storage } from './storage';
import { calculatePlannedLoad, type Workout, type PeriodizationWeek, type PhaseType, type ExerciseTypeDef, type ViewType, type Benchmark, type BenchmarkTypeDef, type AnalyticsCategory } from './types';
import { getWeekId } from './dateUtils';
import { generateId, showAlert, showConfirm } from './utils';
import { slotValues, slotTypeName } from './exerciseSlot';

/**
 * Global reactive state for the application using Svelte 5's $state.
 * This replaces prop-drilling and provides a single source of truth.
 */
class TrainingState {
  // Data State
  workouts = $state<Workout[]>([]);
  periodization = $state<PeriodizationWeek[]>([]);
  exerciseTypes = $state<ExerciseTypeDef[]>([]);
  templates = $state<Record<PhaseType, Partial<Workout>[]>>({} as any);
  benchmarks = $state<Benchmark[]>([]);
  benchmarkTypes = $state<BenchmarkTypeDef[]>([]);
  analyticsCategories = $state<AnalyticsCategory[]>([]);
  isLoading = $state(true);

  view = $state<ViewType>('plan');
  activeWorkout = $state<Workout | null>(null);
  selectedWeekId = $state<string | null>(null);
  weekOffset = $state(0);
  showFatigue = $state(false);
  theme = $state<'dark' | 'light' | 'contrast'>('dark');

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const savedTheme = localStorage.getItem('boulder_tracker_theme');
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'contrast') {
        this.theme = savedTheme;
      }
    }
    this.refresh();
  }

  /**
   * Refreshes all data from storage.
   */
  async refresh() {
    this.isLoading = true;
    try {
      // Run migrations on the local database before loading
      await storage.runStartupMigrations();

      const [w, p, t, e, b, bt, ac] = await Promise.all([
        storage.getWorkouts(),
        storage.getPeriodization(),
        storage.getTemplates(),
        storage.getExerciseTypes(),
        storage.getBenchmarks(),
        storage.getBenchmarkTypes(),
        storage.getAnalyticsCategories()
      ]);

      // Data Cleanup: Fix workouts with 0 plannedLoad that have exercises (Legacy bug)
      let changed = false;
      w.forEach(workout => {
        if ((!workout.plannedLoad || workout.plannedLoad === 0) && workout.exercises.length > 0) {
          workout.plannedLoad = workout.exercises.reduce((acc, ex) => acc + calculatePlannedLoad(ex.prescribed ?? {}), 0);
          changed = true;
        }
      });
      if (changed) {
        // Save back the fixed workouts silently
        await storage._saveWorkouts(w);
      }

      this.workouts = w;
      this.periodization = p;
      this.templates = t;
      this.exerciseTypes = e;
      this.benchmarks = b;
      this.benchmarkTypes = bt;
      this.analyticsCategories = ac;
    } finally {
      this.isLoading = false;
    }
  }

  // --- Derived State ---

  get currentWeekId() {
    return getWeekId(new Date());
  }

  get completedWorkouts() {
    return this.workouts.filter(w => w.status === 'completed');
  }

  getPlannedWorkoutsForWeek(weekId: string) {
    return this.workouts.filter(w => w.weekId === weekId && w.status === 'planned');
  }

  getPeriodizationForWeek(weekId: string) {
    return this.periodization.find(p => p.weekId === weekId);
  }

  getBenchmarksForWeek(weekId: string) {
    return this.benchmarks.filter(b => b.weekId === weekId);
  }

  // --- Actions ---

  /**
   * Navigates to a specific view and optionally sets an active workout.
   */
  navigate(view: ViewType, workout: Workout | null = null) {
    this.view = view;
    this.activeWorkout = workout ? $state.snapshot(workout) : null;
    this.showFatigue = false;
  }

  /**
   * Opens the fatigue rating modal for a specific workout.
   */
  openFatigueModal(workout: Workout) {
    this.activeWorkout = $state.snapshot(workout);
    this.showFatigue = true;
  }

  /**
   * Closes the fatigue modal and clears active workout.
   */
  closeFatigueModal() {
    this.showFatigue = false;
    this.activeWorkout = null;
  }

  /**
   * Completes a workout by applying fatigue data and saving to storage.
   */
  async confirmFatigue(fatigueData: Partial<Workout>) {
    if (!this.activeWorkout) return;
    
    const completedWorkout: Workout = { 
      ...$state.snapshot(this.activeWorkout), 
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
    this.theme = newTheme;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('boulder_tracker_theme', newTheme);
    }
  }

  /**
   * Exports all training data to a JSON file.
   */
  async exportData() {
    try {
      await storage.exportData();
    } catch (err) {
      await showAlert('Export Error', err instanceof Error ? err.message : 'Export failed');
    }
  }

  /**
   * Imports training data from a JSON file.
   */
  async importData(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    try {
      await storage.importData(file);
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
    const workouts = this.workouts;
    if (workouts.length === 0) {
      await showAlert('Export Error', 'No data to export');
      return;
    }

    const rows = [];
    const headers = [
      'Date', 'WeekId', 'Phase', 'Day', 'Workout Notes', 'Workout Description', 'Workout Actual Load', 'Workout Planned Load',
      'Fingers Fatigue', 'Core Fatigue', 'Systemic Fatigue',
      'Exercise Type', 'Exercise Notes', 'Exercise Duration', 'Exercise Planned Load', 'Reps', 'Sets', 'Weight', 'Distance',
      'Hold Type', 'Hold Size', 'Time On', 'Time Off', 'Rest Time', 'Climbing Style', 'Board Type', 'Board Angle'
    ];
    rows.push(headers.join(','));

    workouts.forEach(w => {
      const phase = this.getPeriodizationForWeek(w.weekId)?.phase || '';
      const baseInfo = [
        w.date || '',
        w.weekId,
        `"${phase}"`,
        w.dayOfWeek || '',
        `"${(w.notes || '').replace(/"/g, '""')}"`,
        `"${(w.description || '').replace(/"/g, '""')}"`,
        w.loadFactor || 0,
        w.plannedLoad || 0,
        w.fingers || 0,
        w.core || 0,
        w.systemic || 0
      ];

      if (!w.exercises || w.exercises.length === 0) {
        rows.push([...baseInfo, ...Array(16).fill('')].join(','));
      } else {
        w.exercises.forEach(slot => {
          const e = slotValues(slot);
          const exInfo = [
            `"${slotTypeName(slot, this.exerciseTypes)}"`,
            `"${(e.notes || '').replace(/"/g, '""')}"`,
            e.duration || 0,
            e.plannedLoad || 0,
            e.reps || 0,
            e.sets || 0,
            e.weight || 0,
            e.distance || 0,
            e.holdType || '',
            e.holdSize || 0,
            e.timeOn || 0,
            e.timeOff || 0,
            e.timeBetweenSets || 0,
            (Array.isArray(e.climbingStyle) ? e.climbingStyle.join(' + ') : e.climbingStyle) || '',
            e.boardType || '',
            e.boardAngle || ''
          ];
          rows.push([...baseInfo, ...exInfo].join(','));
        });
      }
    });

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `climbing-tracker-data-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Saves a workout to storage and refreshes local state.
   */
  async saveWorkout(workout: Workout) {
    const data = $state.snapshot(workout);
    
    // Calculate aggregate planned load from exercises
    data.plannedLoad = data.exercises.reduce((acc, e) => acc + calculatePlannedLoad(e.prescribed ?? {}), 0);
    
    await storage.saveWorkout(data);
    await this.refresh();
  }

  /**
   * Handles the high-level logic of saving a workout, including modal triggers.
   */
  async processWorkoutSave(workout: Workout) {
    const data = $state.snapshot(workout);

    if (data.status === 'completed') {
      this.openFatigueModal(data);
    } else {
      await this.saveWorkout(data);
      this.navigate('plan');
    }
  }

  /**
   * Deletes a workout from storage after confirmation.
   */
  async deleteWorkout(id: string) {
    const confirmed = await showConfirm('Delete Workout', 'Are you sure you want to delete this workout?');
    if (!confirmed) return;
    await storage.deleteWorkout(id);
    await this.refresh();
  }


  /**
   * Duplicates an existing workout.
   */
  async duplicateWorkout(workout: Workout) {
    const data = $state.snapshot(workout);
    const duplicated: Workout = {
      ...data,
      id: generateId(),
      status: 'planned',
      date: null,
      // Regenerate every exercise slot's id too, not just the workout's -
      // otherwise the duplicate's slots collide with the original's.
      exercises: data.exercises.map(e => ({ ...e, id: generateId() }))
    };
    await storage.saveWorkout(duplicated);
    await this.refresh();
  }

  /**
   * Saves a benchmark to storage and refreshes local state.
   */
  async saveBenchmark(benchmark: Benchmark) {
    await storage.saveBenchmark(benchmark);
    await this.refresh();
  }

  /**
   * Deletes a benchmark from storage after confirmation.
   */
  async deleteBenchmark(id: string) {
    const confirmed = await showConfirm('Delete Benchmark', 'Are you sure you want to delete this benchmark?');
    if (!confirmed) return;
    await storage.deleteBenchmark(id);
    await this.refresh();
  }


  /**
   * Resets a week by removing its phase assignment and all workouts.
   */
  async clearWeek(weekId: string) {
    const confirmed = await showConfirm('Clear Week', `Are you sure you want to clear all data for ${weekId}? This will delete all workouts and benchmarks for this week.`);
    if (!confirmed) return;
    
    try {
      await storage.clearWeekData(weekId);
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
    await storage.saveBenchmarkTypes(types);
    await this.refresh();
  }

  /**
   * Assigns a training phase to a specific week.
   */
  async assignPhase(weekId: string, phase: PhaseType) {
    await storage.assignPhaseToWeek(weekId, phase);
    await this.refresh();
  }

  /**
   * Updates the global list of analytics categories.
   */
  async updateAnalyticsCategories(categories: AnalyticsCategory[]) {
    await storage.saveAnalyticsCategories(categories);
    await this.refresh();
  }

  /**
   * Updates the global list of exercise modalities.
   */
  async updateExerciseTypes(types: ExerciseTypeDef[]) {
    await storage.saveExerciseTypes(types);
    await this.refresh();
  }



  /**
   * Updates workout templates for different phases.
   */
  async updateTemplates(templates: Record<PhaseType, Partial<Workout>[]>) {
    await storage.saveTemplates(templates);
    await this.refresh();
  }

  /**
   * Resets templates to their default values.
   */
  async resetTemplates() {
    await storage.resetTemplates();
    await this.refresh();
  }
}

export const trainingState = new TrainingState();

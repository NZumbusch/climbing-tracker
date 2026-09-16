import type { Workout, ViewType } from '../types';

/**
 * View/navigation, theme, and modal visibility.
 */
export class UiStore {
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
  }

  /**
   * Navigates to a specific view and optionally sets an active workout.
   */
  navigate(view: ViewType, workout: Workout | null = null) {
    this.view = view;
    this.activeWorkout = workout ? $state.snapshot(workout) as Workout : null;
    this.showFatigue = false;
  }

  /**
   * Opens the fatigue rating modal for a specific workout.
   */
  openFatigueModal(workout: Workout) {
    this.activeWorkout = $state.snapshot(workout) as Workout;
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
   * Updates the theme mode and persists to localStorage
   */
  setTheme(newTheme: 'dark' | 'light' | 'contrast') {
    this.theme = newTheme;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('boulder_tracker_theme', newTheme);
    }
  }
}

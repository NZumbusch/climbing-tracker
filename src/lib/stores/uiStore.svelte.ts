import { Capacitor } from '@capacitor/core';
import type { PermissionState } from '@capacitor/core';
import type { Workout, ViewType } from '../types';
import { showConfirm } from '../utils';
import { requestNotificationPermission, cancelAllReminders } from '../notifications/fatigueReminder';

const NOTIFICATIONS_ENABLED_KEY = 'boulder_tracker_notifications_enabled';
const NOTIFICATIONS_PROMPTED_KEY = 'boulder_tracker_notifications_prompted';

/**
 * View/navigation, theme, notification preferences, and modal visibility.
 */
export class UiStore {
  view = $state<ViewType>('home');
  activeWorkout = $state<Workout | null>(null);
  selectedWeekId = $state<string | null>(null);
  weekOffset = $state(0);
  showFatigue = $state(false);
  theme = $state<'dark' | 'light' | 'contrast'>('dark');
  notificationsEnabled = $state(false);
  notificationPermission = $state<PermissionState>('prompt');

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const savedTheme = localStorage.getItem('boulder_tracker_theme');
      if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'contrast') {
        this.theme = savedTheme;
      }
      this.notificationsEnabled = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === 'true';
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

  /**
   * Enables or disables fatigue-log reminder notifications. Enabling
   * requests OS permission if not already granted; if the user denies it,
   * the preference reverts to disabled rather than silently pretending
   * it's on (actual scheduling happens separately, in `refresh()` via
   * `syncFatigueReminders`, once this flag is true and permission holds).
   */
  async setNotificationsEnabled(enabled: boolean): Promise<boolean> {
    if (enabled) {
      this.notificationPermission = await requestNotificationPermission();
      if (this.notificationPermission !== 'granted') {
        this.notificationsEnabled = false;
        this.persistNotificationsEnabled(false);
        return false;
      }
    } else {
      await cancelAllReminders();
    }
    this.notificationsEnabled = enabled;
    this.persistNotificationsEnabled(enabled);
    return enabled;
  }

  private persistNotificationsEnabled(enabled: boolean) {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
    }
  }

  /**
   * Shows a one-time in-app prompt (native only) asking whether to enable
   * fatigue-log reminders, the first time the app runs after this feature
   * shipped. Never re-prompts after this - a decline is respected, not
   * nagged around (PLAN.md Phase 7's "respect denial gracefully").
   */
  async maybePromptForNotifications() {
    if (!Capacitor.isNativePlatform()) return;
    if (typeof localStorage === 'undefined') return;
    if (localStorage.getItem(NOTIFICATIONS_PROMPTED_KEY)) return;
    localStorage.setItem(NOTIFICATIONS_PROMPTED_KEY, 'true');

    const wantsReminders = await showConfirm(
      'Fatigue Log Reminders',
      "Get a reminder to log fatigue/RPE after a planned workout's time has passed? You can change this anytime in Settings."
    );
    if (wantsReminders) {
      await this.setNotificationsEnabled(true);
    }
  }
}

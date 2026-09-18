import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Workout } from '../types';
import { getDateFromWeekId, calculateWorkoutDuration } from '../ics';
import { reminderId, checkNotificationPermission, cancelRemindersOfType } from './shared';

/**
 * Minutes after a workout's estimated end time before nudging the user to
 * log fatigue. A tunable default, not a fixed rule - same "flag, don't
 * treat as gospel" framing as Phase 4's ACWR ramp-rate threshold.
 */
export const FATIGUE_REMINDER_BUFFER_MINUTES = 20;

export function workoutReminderId(workoutId: string): number {
  return reminderId('fatigue', workoutId);
}

/**
 * When to remind the user to log fatigue for a planned workout: its
 * scheduled start time (resolved from weekId/dayOfWeek via the same logic
 * `ics.ts` uses for calendar export) plus its estimated duration plus a
 * fixed buffer. Returns null if the workout has no resolvable schedule.
 */
export function computeFatigueReminderTime(workout: Workout): Date | null {
  if (!workout.weekId) return null;

  const startDate = getDateFromWeekId(workout.weekId, workout.dayOfWeek);
  if (workout.startTime) {
    const [h, m] = workout.startTime.split(':').map(Number);
    startDate.setHours(h, m, 0, 0);
  } else {
    startDate.setHours(12, 0, 0, 0);
  }

  const durationMinutes = calculateWorkoutDuration(workout);
  return new Date(startDate.getTime() + (durationMinutes + FATIGUE_REMINDER_BUFFER_MINUTES) * 60 * 1000);
}

/**
 * Reconciles scheduled fatigue-reminder notifications with the current
 * workout list: cancels every *fatigue-type* notification previously
 * scheduled (never another type's - see `cancelRemindersOfType`) and
 * reschedules one per planned workout whose reminder time is still in the
 * future. Simpler and safer than diffing/patching individual
 * notifications, at the cost of redundant cancel+reschedule calls on
 * every sync - acceptable for a purely local, infrequent (once per app
 * refresh) operation.
 *
 * No-ops on web and when permission isn't granted, so it's always safe to
 * call from `refresh()` without checking the platform first.
 */
export async function syncFatigueReminders(workouts: Workout[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  const permission = await checkNotificationPermission();
  if (permission !== 'granted') return;

  await cancelRemindersOfType('fatigue');

  const now = new Date();
  const toSchedule = workouts
    .filter(w => w.status === 'planned')
    .map(w => ({ workout: w, at: computeFatigueReminderTime(w) }))
    .filter((entry): entry is { workout: Workout; at: Date } => entry.at !== null && entry.at > now)
    .map(({ workout, at }) => ({
      id: workoutReminderId(workout.id),
      title: 'Log your session',
      body: `Did "${workout.notes || 'your planned workout'}" happen? Log fatigue/RPE while it's fresh.`,
      schedule: { at },
      // A reminder a few minutes late is fine for this feature - avoid Android's
      // exact-alarm permission flow (which would otherwise open a system
      // settings screen the first time this schedules) by not requiring it.
      isExactNotification: false,
    }));

  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: toSchedule });
  }
}

import { Capacitor } from '@capacitor/core';
import type { PermissionState } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { Workout } from '../types';
import { getDateFromWeekId, calculateWorkoutDuration } from '../ics';

/**
 * Minutes after a workout's estimated end time before nudging the user to
 * log fatigue. A tunable default, not a fixed rule - same "flag, don't
 * treat as gospel" framing as Phase 4's ACWR ramp-rate threshold.
 */
export const FATIGUE_REMINDER_BUFFER_MINUTES = 20;

/**
 * Shared notification id-ownership scheme (UI_PLAN.md §5.6, Stage 8's
 * first commit). Every reminder type this app schedules gets a disjoint
 * slice of the positive-32-bit-int id space, encoded in each id's top
 * `TYPE_BITS` bits - so which type owns a given pending notification is
 * derivable from its id alone (`reminderTypeOf`), with no separate
 * mapping table to keep in sync. This replaces the old assumption
 * ("fatigue reminders are the only `LocalNotifications` user in the app,
 * so cancelling everything pending is always safe") that the daily-
 * metrics reminder (next, this stage) would otherwise silently break -
 * whichever reminder type synced last would have cancelled the other
 * type's still-valid pending notifications.
 *
 * Deliberately still living in this file rather than a new shared module -
 * `fatigueReminder.ts` is the only reminder-type file that exists yet, and
 * splitting this out now would touch import sites with no functional
 * benefit. Revisit once the daily-metrics reminder (this stage's next
 * part) has its own real scheduling logic alongside this.
 */
export type ReminderType = 'fatigue' | 'dailyMetrics';

// 4 bits -> 16 possible reminder types, far more than this app will ever
// need, leaving 27 bits (~134M) for each type's own hash space.
const TYPE_BITS = 4;
const TYPE_TAGS: Record<ReminderType, number> = {
  fatigue: 0,
  dailyMetrics: 1,
};
const HASH_BITS = 31 - TYPE_BITS;
const HASH_SPACE = 2 ** HASH_BITS;

function hashToRange(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % HASH_SPACE;
}

/**
 * Stable positive 32-bit integer id for a reminder (local-notifications
 * requires a numeric id; this app's own keys - workout ids, etc. - are
 * strings). Collisions within one type's hash space are possible but
 * low-probability and low-consequence - scheduling is fully reconciled
 * from scratch on every sync, so a persisted id-mapping table isn't worth
 * adding for this feature's scope. Collisions *across* types are
 * impossible by construction (disjoint top-bit ranges).
 */
function reminderId(type: ReminderType, key: string): number {
  return (TYPE_TAGS[type] << HASH_BITS) | hashToRange(key);
}

/** Inverse of `reminderId` - which reminder type (if any recognized) owns a given pending notification's id. */
export function reminderTypeOf(id: number): ReminderType | undefined {
  const tag = id >>> HASH_BITS;
  return (Object.keys(TYPE_TAGS) as ReminderType[]).find((t) => TYPE_TAGS[t] === tag);
}

export function workoutReminderId(workoutId: string): number {
  return reminderId('fatigue', workoutId);
}

/**
 * The daily-metrics reminder (this stage's next part) is a single
 * recurring "have you logged today's metrics" notification, not one per
 * workout - so it gets one fixed id within its own type's namespace
 * rather than a hash of anything variable.
 */
export function dailyMetricsReminderId(): number {
  return reminderId('dailyMetrics', 'daily-metrics-reminder');
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

/** Web has no local-notifications concept; treat it as always denied rather than granted, so callers never schedule there. */
export async function checkNotificationPermission(): Promise<PermissionState> {
  if (!Capacitor.isNativePlatform()) return 'denied';
  const result = await LocalNotifications.checkPermissions();
  return result.display;
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!Capacitor.isNativePlatform()) return 'denied';
  const result = await LocalNotifications.requestPermissions();
  return result.display;
}

/**
 * Cancels every pending notification belonging to one reminder type,
 * leaving every other type's pending notifications untouched - the
 * "cancel-mine" replacement for the old cancel-everything assumption.
 * Reads `getPending()` and filters by `reminderTypeOf` rather than
 * tracking scheduled ids separately, so it's always correct even after an
 * app restart (nothing here depends on in-memory state surviving).
 */
export async function cancelRemindersOfType(type: ReminderType): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  const mine = pending.notifications.filter((n) => reminderTypeOf(n.id) === type);
  if (mine.length > 0) {
    await LocalNotifications.cancel({ notifications: mine.map((n) => ({ id: n.id })) });
  }
}

/**
 * Cancels every pending notification this app has scheduled, regardless of
 * type - for "the user turned notifications off entirely"
 * (`UiStore.setNotificationsEnabled(false)`), not for one type's own sync.
 * Safe to cancel everything unfiltered here specifically because this is a
 * whole-app opt-out, not a single type reconciling itself - the case
 * `cancelRemindersOfType` exists to handle correctly is the opposite one
 * (type A syncing must never cancel type B's still-valid reminders).
 */
export async function cancelAllReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  }
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

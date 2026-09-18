import { Capacitor } from '@capacitor/core';
import type { PermissionState } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Shared `LocalNotifications` infrastructure used by every reminder type
 * (UI_PLAN.md §5.6/§5.8, Stage 8) - extracted out of `fatigueReminder.ts`
 * once the daily-metrics reminder gave it a second real caller, per that
 * file's own note that this was the point to revisit at.
 *
 * **Id ownership.** Every reminder type gets a disjoint slice of the
 * positive-32-bit-int id space, encoded in each id's top `TYPE_BITS` bits -
 * so which type owns a given pending notification is derivable from its id
 * alone (`reminderTypeOf`), with no separate mapping table to keep in
 * sync. This is what makes `cancelRemindersOfType` safe: syncing one
 * reminder type can never cancel another type's still-valid pending
 * notifications, the exact failure mode the old "cancel everything, this
 * is the only `LocalNotifications` user" assumption would have hit the
 * moment a second reminder type existed.
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
export function reminderId(type: ReminderType, key: string): number {
  return (TYPE_TAGS[type] << HASH_BITS) | hashToRange(key);
}

/** Inverse of `reminderId` - which reminder type (if any recognized) owns a given pending notification's id. */
export function reminderTypeOf(id: number): ReminderType | undefined {
  const tag = id >>> HASH_BITS;
  return (Object.keys(TYPE_TAGS) as ReminderType[]).find((t) => TYPE_TAGS[t] === tag);
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
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
}

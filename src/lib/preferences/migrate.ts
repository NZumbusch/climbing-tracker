/**
 * Device-local UI preferences (text scale, motion, and - going forward -
 * anything else purely cosmetic/device-specific). Deliberately outside
 * `TrainingData`: see UI_PLAN.md §5.1 - these are not athlete data, and
 * routing them through the `TrainingData` migration chain would mean a
 * schema field + migration step + `DATA_EXPORT_VERSION` bump for every new
 * toggle, against the highest-blast-radius part of the app.
 *
 * `theme` and `notificationsEnabled` are included in this shape for forward
 * compatibility (a future stage can move their live ownership here without
 * another shape change) but are NOT yet live-managed by this module - they
 * stay on their existing standalone `localStorage` keys, owned by `UiStore`,
 * per UI_PLAN.md §5.1. `migratePreferences` only folds their *current*
 * values in once, at first load, so a fresh `boulder_tracker_preferences`
 * blob does not silently reset a returning user's theme/notification choice
 * back to defaults. After that fold, this module never re-reads or
 * overwrites those two fields - `UiStore` remains their sole writer.
 */

export const CURRENT_PREFERENCES_VERSION = 1;

export type TextScale = 'sm' | 'md' | 'lg';
export type MotionPreference = 'system' | 'full' | 'reduced';
export type ThemePreference = 'dark' | 'light' | 'contrast';

export interface Preferences {
  version: number;
  textScale: TextScale;
  motion: MotionPreference;
  /** Forward-compat only - see module doc comment. Not live-managed here yet. */
  theme: ThemePreference;
  /** Forward-compat only - see module doc comment. Not live-managed here yet. */
  notificationsEnabled: boolean;
  /**
   * Whether the daily-metrics reminder (UI_PLAN.md §5.8, Stage 8) should
   * schedule at all once notifications are otherwise enabled. Defaults to
   * `true` - it's inert until `notificationsEnabled` is also true and
   * permission is granted, so there's no separate opt-in step needed on
   * top of turning notifications on in the first place.
   */
  dailyMetricsReminderEnabled: boolean;
  /** "HH:mm", 24-hour, local time. Default 20:00 per UI_PLAN.md §10 open question 4. */
  dailyMetricsReminderTime: string;
  /**
   * Weather (UI_PLAN.md §5.5) - both `null` by default, meaning the whole
   * feature is off until the user sets a location (Stage 8's Settings
   * screen, not yet built - these fields are inert until then). `trip` is
   * the optional second location for planning outdoor trips; `home` alone
   * drives the Home strip.
   */
  homeLocation: WeatherLocation | null;
  tripLocation: WeatherLocation | null;
}

export const DEFAULT_DAILY_METRICS_REMINDER_TIME = '20:00';

/** A resolved lat/lon plus a display label - either geocoded from a city name or entered directly (UI_PLAN.md §10 open question 3: raw lat/lon must work with no geocoding call). */
export interface WeatherLocation {
  name: string;
  latitude: number;
  longitude: number;
}

/** Values a fresh install (or an unreadable/corrupt blob) starts from. */
export function defaultPreferences(): Preferences {
  return {
    version: CURRENT_PREFERENCES_VERSION,
    textScale: 'md',
    motion: 'system',
    theme: 'dark',
    notificationsEnabled: false,
    dailyMetricsReminderEnabled: true,
    dailyMetricsReminderTime: DEFAULT_DAILY_METRICS_REMINDER_TIME,
    homeLocation: null,
    tripLocation: null,
  };
}

const TEXT_SCALES: TextScale[] = ['sm', 'md', 'lg'];
const MOTION_PREFS: MotionPreference[] = ['system', 'full', 'reduced'];
const THEMES: ThemePreference[] = ['dark', 'light', 'contrast'];

/** Validates an unknown value as a `WeatherLocation`, or `null` if it isn't one - never throws, mirrors every other field's independent-defaulting discipline. */
function validateLocation(raw: unknown): WeatherLocation | null {
  if (raw === null || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.name !== 'string' || c.name.trim() === '') return null;
  if (typeof c.latitude !== 'number' || c.latitude < -90 || c.latitude > 90) return null;
  if (typeof c.longitude !== 'number' || c.longitude < -180 || c.longitude > 180) return null;
  return { name: c.name, latitude: c.latitude, longitude: c.longitude };
}

/** The legacy standalone values to fold in when no preferences blob exists yet. */
export interface LegacyPreferenceValues {
  theme?: ThemePreference;
  notificationsEnabled?: boolean;
}

/**
 * Pure, never throws. Unknown/corrupt/missing input returns defaults
 * (folding in `legacy` values, if given, so a returning user's theme/
 * notification choice survives this preferences key not existing yet).
 * Unknown extra keys are dropped; each known key is validated and falls
 * back to its own default independently, rather than discarding the whole
 * object over one bad field. An unrecognised `version` (including a future
 * one newer than `CURRENT_PREFERENCES_VERSION`) is treated the same as
 * missing/corrupt input - safest default when this code doesn't know what
 * that version's shape means.
 */
export function migratePreferences(raw: unknown, legacy?: LegacyPreferenceValues): Preferences {
  const defaults = defaultPreferences();
  if (legacy?.theme && THEMES.includes(legacy.theme)) defaults.theme = legacy.theme;
  if (typeof legacy?.notificationsEnabled === 'boolean') {
    defaults.notificationsEnabled = legacy.notificationsEnabled;
  }

  if (typeof raw !== 'object' || raw === null) return defaults;
  const candidate = raw as Record<string, unknown>;
  if (candidate.version !== CURRENT_PREFERENCES_VERSION) return defaults;

  return {
    version: CURRENT_PREFERENCES_VERSION,
    textScale: TEXT_SCALES.includes(candidate.textScale as TextScale)
      ? (candidate.textScale as TextScale)
      : defaults.textScale,
    motion: MOTION_PREFS.includes(candidate.motion as MotionPreference)
      ? (candidate.motion as MotionPreference)
      : defaults.motion,
    theme: THEMES.includes(candidate.theme as ThemePreference)
      ? (candidate.theme as ThemePreference)
      : defaults.theme,
    dailyMetricsReminderEnabled: typeof candidate.dailyMetricsReminderEnabled === 'boolean'
      ? candidate.dailyMetricsReminderEnabled
      : defaults.dailyMetricsReminderEnabled,
    dailyMetricsReminderTime: typeof candidate.dailyMetricsReminderTime === 'string'
      && /^([01]\d|2[0-3]):[0-5]\d$/.test(candidate.dailyMetricsReminderTime)
      ? candidate.dailyMetricsReminderTime
      : defaults.dailyMetricsReminderTime,
    notificationsEnabled: typeof candidate.notificationsEnabled === 'boolean'
      ? candidate.notificationsEnabled
      : defaults.notificationsEnabled,
    homeLocation: candidate.homeLocation === undefined ? defaults.homeLocation : validateLocation(candidate.homeLocation),
    tripLocation: candidate.tripLocation === undefined ? defaults.tripLocation : validateLocation(candidate.tripLocation),
  };
}

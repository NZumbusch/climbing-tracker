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
  /** Bars is the default (UI_PLAN.md §2/§3.3) - radar is the user-requested alternate, both real. */
  fatigueChartStyle: FatigueChartStyle;
  /**
   * Timer behaviour toggles (UI_PLAN.md §5.7) - defaults match §4.7's own
   * mockup (vibrate/beep on, keep-awake off). Independently togglable, not
   * one master "sound on" switch - a user might want the haptic without
   * the beep, e.g.
   */
  timerVibrateEnabled: boolean;
  timerBeepEnabled: boolean;
  timerKeepAwakeEnabled: boolean;
  /**
   * Home section visibility + order (UI_PLAN.md §4.7's "Home sections
   * show/hide + reorder"). The array's order *is* the display order: an
   * entry earlier in the array renders above one later in it. Every known
   * section id must appear exactly once - `migratePreferences` repairs a
   * corrupt/partial list back to this invariant rather than letting a
   * section silently disappear or duplicate.
   */
  homeSections: HomeSectionPreference[];
}

/** Every togglable/reorderable Home section below the always-shown header (UI_PLAN.md §4.2), in the plan's own fixed default order. */
export const HOME_SECTION_IDS = [
  'readiness',
  'today',
  'metrics',
  'fatigue',
  'thisWeek',
  'trainingBlock',
  'competition',
  'recentActivity',
  'weather',
] as const;
export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

export interface HomeSectionPreference {
  id: HomeSectionId;
  visible: boolean;
}

export type FatigueChartStyle = 'bars' | 'radar';

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
    fatigueChartStyle: 'bars',
    timerVibrateEnabled: true,
    timerBeepEnabled: true,
    timerKeepAwakeEnabled: false,
    homeSections: HOME_SECTION_IDS.map((id) => ({ id, visible: true })),
  };
}

const TEXT_SCALES: TextScale[] = ['sm', 'md', 'lg'];
const MOTION_PREFS: MotionPreference[] = ['system', 'full', 'reduced'];
const THEMES: ThemePreference[] = ['dark', 'light', 'contrast'];
const FATIGUE_CHART_STYLES: FatigueChartStyle[] = ['bars', 'radar'];

/** Validates an unknown value as a `WeatherLocation`, or `null` if it isn't one - never throws, mirrors every other field's independent-defaulting discipline. */
function validateLocation(raw: unknown): WeatherLocation | null {
  if (raw === null || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.name !== 'string' || c.name.trim() === '') return null;
  if (typeof c.latitude !== 'number' || c.latitude < -90 || c.latitude > 90) return null;
  if (typeof c.longitude !== 'number' || c.longitude < -180 || c.longitude > 180) return null;
  return { name: c.name, latitude: c.latitude, longitude: c.longitude };
}

/**
 * Repairs an unknown value into a valid `HomeSectionPreference[]`: unknown
 * ids and duplicate entries are dropped, and any known section missing
 * from the recovered list (a corrupt blob, a partial one, or one written
 * by an older app version that didn't know about a newer section) is
 * appended visible, in `HOME_SECTION_IDS`'s canonical order - so a section
 * can never silently disappear or duplicate, and this can never throw.
 */
function validateHomeSections(raw: unknown): HomeSectionPreference[] {
  const seen = new Set<HomeSectionId>();
  const result: HomeSectionPreference[] = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue;
      const c = entry as Record<string, unknown>;
      if (typeof c.id !== 'string' || !(HOME_SECTION_IDS as readonly string[]).includes(c.id)) continue;
      const id = c.id as HomeSectionId;
      if (seen.has(id)) continue;
      seen.add(id);
      result.push({ id, visible: typeof c.visible === 'boolean' ? c.visible : true });
    }
  }
  for (const id of HOME_SECTION_IDS) {
    if (!seen.has(id)) result.push({ id, visible: true });
  }
  return result;
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
    fatigueChartStyle: FATIGUE_CHART_STYLES.includes(candidate.fatigueChartStyle as FatigueChartStyle)
      ? (candidate.fatigueChartStyle as FatigueChartStyle)
      : defaults.fatigueChartStyle,
    timerVibrateEnabled: typeof candidate.timerVibrateEnabled === 'boolean'
      ? candidate.timerVibrateEnabled
      : defaults.timerVibrateEnabled,
    timerBeepEnabled: typeof candidate.timerBeepEnabled === 'boolean'
      ? candidate.timerBeepEnabled
      : defaults.timerBeepEnabled,
    timerKeepAwakeEnabled: typeof candidate.timerKeepAwakeEnabled === 'boolean'
      ? candidate.timerKeepAwakeEnabled
      : defaults.timerKeepAwakeEnabled,
    homeSections: candidate.homeSections === undefined ? defaults.homeSections : validateHomeSections(candidate.homeSections),
  };
}

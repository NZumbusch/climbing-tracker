import { migratePreferences, defaultPreferences, type TextScale, type MotionPreference, type Preferences } from '../preferences/migrate';

const PREFERENCES_KEY = 'boulder_tracker_preferences';
const LEGACY_THEME_KEY = 'boulder_tracker_theme';
const LEGACY_NOTIFICATIONS_KEY = 'boulder_tracker_notifications_enabled';

/**
 * Device-local UI preferences (text scale, motion). See
 * `src/lib/preferences/migrate.ts` for why this is separate from
 * `TrainingData` and why `theme`/`notificationsEnabled` are folded in but
 * not live-managed here (that stays `UiStore`'s job for now).
 */
export class PreferencesStore {
  textScale = $state<TextScale>('md');
  motion = $state<MotionPreference>('system');
  dailyMetricsReminderEnabled = $state(true);
  dailyMetricsReminderTime = $state('20:00');

  constructor() {
    if (typeof localStorage === 'undefined') return;

    const rawStored = localStorage.getItem(PREFERENCES_KEY);
    const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
    const legacyNotifications = localStorage.getItem(LEGACY_NOTIFICATIONS_KEY);

    const prefs = migratePreferences(
      rawStored ? safeParse(rawStored) : undefined,
      {
        theme: (legacyTheme === 'light' || legacyTheme === 'dark' || legacyTheme === 'contrast')
          ? legacyTheme
          : undefined,
        notificationsEnabled: legacyNotifications === null ? undefined : legacyNotifications === 'true',
      },
    );

    this.textScale = prefs.textScale;
    this.motion = prefs.motion;
    this.dailyMetricsReminderEnabled = prefs.dailyMetricsReminderEnabled;
    this.dailyMetricsReminderTime = prefs.dailyMetricsReminderTime;

    // Persist immediately so the fold (or a version migration) only ever
    // has to happen once, and so a fresh install's defaults are recorded
    // rather than re-derived from scratch on every load.
    if (rawStored === null || !isCurrentShape(rawStored, prefs)) {
      this.persist(prefs);
    }
  }

  setTextScale(scale: TextScale) {
    this.textScale = scale;
    this.persist();
  }

  setMotion(motion: MotionPreference) {
    this.motion = motion;
    this.persist();
  }

  setDailyMetricsReminderEnabled(enabled: boolean) {
    this.dailyMetricsReminderEnabled = enabled;
    this.persist();
  }

  setDailyMetricsReminderTime(time: string) {
    this.dailyMetricsReminderTime = time;
    this.persist();
  }

  /**
   * Re-reads the legacy theme/notification keys at persist time (rather
   * than trusting a value captured at construction) so this blob's copies
   * of them stay in sync with whatever `UiStore` currently has, instead of
   * drifting back to defaults the next time text scale or motion changes.
   */
  private persist(prefs?: Preferences) {
    if (typeof localStorage === 'undefined') return;
    const legacyTheme = localStorage.getItem(LEGACY_THEME_KEY);
    const legacyNotifications = localStorage.getItem(LEGACY_NOTIFICATIONS_KEY);
    const toWrite = prefs ?? {
      ...defaultPreferences(),
      textScale: this.textScale,
      motion: this.motion,
      dailyMetricsReminderEnabled: this.dailyMetricsReminderEnabled,
      dailyMetricsReminderTime: this.dailyMetricsReminderTime,
      theme: (legacyTheme === 'light' || legacyTheme === 'dark' || legacyTheme === 'contrast')
        ? legacyTheme
        : defaultPreferences().theme,
      notificationsEnabled: legacyNotifications === null ? defaultPreferences().notificationsEnabled : legacyNotifications === 'true',
    };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(toWrite));
  }
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isCurrentShape(rawStored: string, migrated: ReturnType<typeof migratePreferences>): boolean {
  const parsed = safeParse(rawStored);
  return typeof parsed === 'object' && parsed !== null
    && JSON.stringify(parsed) === JSON.stringify(migrated);
}

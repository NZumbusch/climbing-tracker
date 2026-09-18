import { migratePreferences, defaultPreferences, HOME_SECTION_IDS, type TextScale, type MotionPreference, type Preferences, type WeatherLocation, type FatigueChartStyle, type HomeSectionPreference, type AISharingPreferences } from '../preferences/migrate';

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
  homeLocation = $state<WeatherLocation | null>(null);
  tripLocation = $state<WeatherLocation | null>(null);
  fatigueChartStyle = $state<FatigueChartStyle>('bars');
  timerVibrateEnabled = $state(true);
  timerBeepEnabled = $state(true);
  timerKeepAwakeEnabled = $state(false);
  homeSections = $state<HomeSectionPreference[]>(HOME_SECTION_IDS.map((id) => ({ id, visible: true })));
  aiSharing = $state<AISharingPreferences>(defaultPreferences().aiSharing);

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
    this.homeLocation = prefs.homeLocation;
    this.tripLocation = prefs.tripLocation;
    this.fatigueChartStyle = prefs.fatigueChartStyle;
    this.timerVibrateEnabled = prefs.timerVibrateEnabled;
    this.timerBeepEnabled = prefs.timerBeepEnabled;
    this.timerKeepAwakeEnabled = prefs.timerKeepAwakeEnabled;
    this.homeSections = prefs.homeSections;
    this.aiSharing = prefs.aiSharing;

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

  setHomeLocation(location: WeatherLocation | null) {
    this.homeLocation = location;
    this.persist();
  }

  setTripLocation(location: WeatherLocation | null) {
    this.tripLocation = location;
    this.persist();
  }

  setFatigueChartStyle(style: FatigueChartStyle) {
    this.fatigueChartStyle = style;
    this.persist();
  }

  setTimerVibrateEnabled(enabled: boolean) {
    this.timerVibrateEnabled = enabled;
    this.persist();
  }

  setTimerBeepEnabled(enabled: boolean) {
    this.timerBeepEnabled = enabled;
    this.persist();
  }

  setTimerKeepAwakeEnabled(enabled: boolean) {
    this.timerKeepAwakeEnabled = enabled;
    this.persist();
  }

  setHomeSectionVisible(id: HomeSectionPreference['id'], visible: boolean) {
    this.homeSections = this.homeSections.map((s) => (s.id === id ? { ...s, visible } : s));
    this.persist();
  }

  /** Reorders `homeSections` to exactly `order` (every known id, in the given sequence) - the write path for drag-reorder in Settings. */
  setHomeSectionOrder(order: HomeSectionPreference['id'][]) {
    const byId = new Map(this.homeSections.map((s) => [s.id, s]));
    this.homeSections = order.map((id) => byId.get(id)!).filter(Boolean);
    this.persist();
  }

  setAiSharing(category: keyof AISharingPreferences, enabled: boolean) {
    this.aiSharing = { ...this.aiSharing, [category]: enabled };
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
      homeLocation: this.homeLocation,
      tripLocation: this.tripLocation,
      fatigueChartStyle: this.fatigueChartStyle,
      timerVibrateEnabled: this.timerVibrateEnabled,
      timerBeepEnabled: this.timerBeepEnabled,
      timerKeepAwakeEnabled: this.timerKeepAwakeEnabled,
      homeSections: this.homeSections,
      aiSharing: this.aiSharing,
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

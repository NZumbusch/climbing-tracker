import { describe, it, expect } from 'vitest';
import { migratePreferences, defaultPreferences, CURRENT_PREFERENCES_VERSION } from './migrate';

describe('defaultPreferences', () => {
  it('returns the current version and sane defaults', () => {
    expect(defaultPreferences()).toEqual({
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'md',
      motion: 'system',
      theme: 'dark',
      notificationsEnabled: false,
      dailyMetricsReminderEnabled: true,
      dailyMetricsReminderTime: '20:00',
      homeLocation: null,
      tripLocation: null,
    });
  });
});

describe('migratePreferences', () => {
  it('never throws on garbage input', () => {
    expect(() => migratePreferences(undefined)).not.toThrow();
    expect(() => migratePreferences(null)).not.toThrow();
    expect(() => migratePreferences('not an object')).not.toThrow();
    expect(() => migratePreferences(42)).not.toThrow();
    expect(() => migratePreferences([1, 2, 3])).not.toThrow();
  });

  it('returns defaults for corrupt/missing input with no legacy values', () => {
    expect(migratePreferences(undefined)).toEqual(defaultPreferences());
    expect(migratePreferences(null)).toEqual(defaultPreferences());
    expect(migratePreferences('garbage')).toEqual(defaultPreferences());
  });

  it('folds legacy theme/notifications values into defaults when no blob exists', () => {
    const result = migratePreferences(undefined, { theme: 'light', notificationsEnabled: true });
    expect(result.theme).toBe('light');
    expect(result.notificationsEnabled).toBe(true);
    expect(result.textScale).toBe('md');
    expect(result.motion).toBe('system');
  });

  it('ignores an invalid legacy theme rather than folding it in', () => {
    const result = migratePreferences(undefined, { theme: 'neon' as any });
    expect(result.theme).toBe('dark');
  });

  it('round-trips a valid current-version blob unchanged', () => {
    const valid = {
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'lg' as const,
      motion: 'reduced' as const,
      theme: 'contrast' as const,
      notificationsEnabled: true,
      dailyMetricsReminderEnabled: false,
      dailyMetricsReminderTime: '07:30',
      homeLocation: { name: 'Munich, DE', latitude: 48.1374, longitude: 11.5755 },
      tripLocation: null,
    };
    expect(migratePreferences(valid)).toEqual(valid);
  });

  it('drops unknown extra keys', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'sm',
      motion: 'full',
      theme: 'dark',
      notificationsEnabled: false,
      dailyMetricsReminderEnabled: true,
      dailyMetricsReminderTime: '20:00',
      someFutureField: 'nonsense',
    });
    expect(result).not.toHaveProperty('someFutureField');
  });

  it('defaults an individual invalid field without discarding the rest of the object', () => {
    const result = migratePreferences({
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'xl', // invalid
      motion: 'full',
      theme: 'light',
      notificationsEnabled: true,
      dailyMetricsReminderEnabled: true,
      dailyMetricsReminderTime: '20:00',
    });
    expect(result.textScale).toBe('md'); // fell back to default
    expect(result.motion).toBe('full'); // valid fields preserved
    expect(result.theme).toBe('light');
    expect(result.notificationsEnabled).toBe(true);
  });

  it('defaults missing individual fields on a partial current-version object', () => {
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, textScale: 'lg' });
    expect(result.textScale).toBe('lg');
    expect(result.motion).toBe('system');
    expect(result.theme).toBe('dark');
    expect(result.notificationsEnabled).toBe(false);
    expect(result.dailyMetricsReminderEnabled).toBe(true);
    expect(result.dailyMetricsReminderTime).toBe('20:00');
  });

  it('backward compat: a real Stage-0-era blob with no daily-metrics fields at all gets them defaulted, without resetting textScale/motion (no version bump was needed for this addition)', () => {
    const stage0Blob = {
      version: CURRENT_PREFERENCES_VERSION,
      textScale: 'lg',
      motion: 'reduced',
      theme: 'light',
      notificationsEnabled: true,
      // no dailyMetricsReminderEnabled / dailyMetricsReminderTime keys at all
    };
    const result = migratePreferences(stage0Blob);
    expect(result.textScale).toBe('lg');
    expect(result.motion).toBe('reduced');
    expect(result.theme).toBe('light');
    expect(result.notificationsEnabled).toBe(true);
    expect(result.dailyMetricsReminderEnabled).toBe(true);
    expect(result.dailyMetricsReminderTime).toBe('20:00');
  });

  it('rejects a malformed dailyMetricsReminderTime and falls back to the default', () => {
    for (const bad of ['8pm', '25:00', '20:60', '2000', '', 42]) {
      const result = migratePreferences({
        version: CURRENT_PREFERENCES_VERSION,
        dailyMetricsReminderTime: bad,
      });
      expect(result.dailyMetricsReminderTime).toBe('20:00');
    }
  });

  it('accepts valid HH:mm times, including midnight and single-digit-looking edges', () => {
    for (const good of ['00:00', '09:05', '23:59']) {
      const result = migratePreferences({
        version: CURRENT_PREFERENCES_VERSION,
        dailyMetricsReminderTime: good,
      });
      expect(result.dailyMetricsReminderTime).toBe(good);
    }
  });

  it('treats an unrecognised version (including a future one) as corrupt and returns defaults', () => {
    const futureShape = { version: CURRENT_PREFERENCES_VERSION + 1, textScale: 'lg', someNewField: true };
    expect(migratePreferences(futureShape)).toEqual(defaultPreferences());

    const legacyUnversioned = { textScale: 'lg' };
    expect(migratePreferences(legacyUnversioned)).toEqual(defaultPreferences());
  });

  it('still folds legacy values even when the stored blob itself is an unrecognised version', () => {
    const result = migratePreferences(
      { version: 0, textScale: 'lg' },
      { theme: 'light', notificationsEnabled: true },
    );
    expect(result.theme).toBe('light');
    expect(result.notificationsEnabled).toBe(true);
    expect(result.textScale).toBe('md'); // the corrupt blob's data is not trusted
  });
});

describe('homeLocation / tripLocation (UI_PLAN.md §5.5)', () => {
  it('default to null - the whole weather feature is off until a location is set', () => {
    expect(defaultPreferences().homeLocation).toBeNull();
    expect(defaultPreferences().tripLocation).toBeNull();
  });

  it('accepts a valid location object for either field', () => {
    const home = { name: 'Munich, DE', latitude: 48.1374, longitude: 11.5755 };
    const trip = { name: 'Fontainebleau, FR', latitude: 48.4042, longitude: 2.7017 };
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeLocation: home, tripLocation: trip });
    expect(result.homeLocation).toEqual(home);
    expect(result.tripLocation).toEqual(trip);
  });

  it('an explicit null clears a location back to unset', () => {
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeLocation: null });
    expect(result.homeLocation).toBeNull();
  });

  it('rejects a location missing a name, or with out-of-range coordinates, falling back to null rather than throwing', () => {
    const badShapes = [
      { latitude: 48, longitude: 11 }, // no name
      { name: 'Nowhere', latitude: 95, longitude: 11 }, // latitude out of range
      { name: 'Nowhere', latitude: 48, longitude: 200 }, // longitude out of range
      { name: '', latitude: 48, longitude: 11 }, // blank name
      'not an object',
      42,
    ];
    for (const bad of badShapes) {
      const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeLocation: bad });
      expect(result.homeLocation).toBeNull();
    }
  });

  it('accepts boundary-valid coordinates (poles and the antimeridian)', () => {
    const location = { name: 'North Pole', latitude: 90, longitude: -180 };
    const result = migratePreferences({ version: CURRENT_PREFERENCES_VERSION, homeLocation: location });
    expect(result.homeLocation).toEqual(location);
  });
});

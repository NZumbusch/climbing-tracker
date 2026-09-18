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

import type { WeatherLocation } from '../preferences/migrate';
import { fetchWeatherSnapshot, type WeatherSnapshot } from '../weather/api';

const CACHE_KEY = 'boulder_tracker_weather_cache';

interface CachedEntry {
  snapshot: WeatherSnapshot;
  fetchedAt: string;
  locationName: string;
}

interface CacheShape {
  home?: CachedEntry;
  trip?: CachedEntry;
}

export interface WeatherState {
  snapshot: WeatherSnapshot | null;
  /** ISO timestamp of the snapshot's fetch, for "last updated Xh ago" labelling. */
  fetchedAt: string | null;
  locationName: string | null;
  /** True once any fetch has succeeded, cleared only by a newer successful fetch - never re-fetched implicitly. */
  stale: boolean;
  loading: boolean;
  /** True once a fetch has failed with nothing cached to fall back on - the one genuinely "absent" state (UI_PLAN.md §5.5: "must degrade to absent, never broken"). */
  unavailable: boolean;
}

function emptyState(): WeatherState {
  return { snapshot: null, fetchedAt: null, locationName: null, stale: false, loading: false, unavailable: false };
}

/**
 * Weather (UI_PLAN.md §5.5) - the app's one network dependency, isolated
 * behind `src/lib/weather/api.ts`'s pure fetch wrappers so this store only
 * ever deals with already-shaped data or `null`. Caches the last
 * successful snapshot per location (home/trip) in `localStorage` with its
 * fetch timestamp, so a cold app start while offline shows the last known
 * conditions labelled as stale rather than a blank card or an indefinite
 * spinner - the stash's `Dashboard.svelte` did the latter, explicitly
 * flagged in the stash audit as a pattern not to repeat.
 */
export class WeatherStore {
  home = $state<WeatherState>(emptyState());
  trip = $state<WeatherState>(emptyState());

  constructor() {
    this.loadCache();
  }

  private loadCache() {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    try {
      const cache: CacheShape = JSON.parse(raw);
      if (cache.home) this.home = cachedEntryToState(cache.home);
      if (cache.trip) this.trip = cachedEntryToState(cache.trip);
    } catch {
      // Corrupt cache - ignore and start from an empty (not "unavailable") state; the next successful fetch repopulates it.
    }
  }

  private persistCache(key: 'home' | 'trip', entry: CachedEntry) {
    if (typeof localStorage === 'undefined') return;
    let cache: CacheShape = {};
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      cache = raw ? JSON.parse(raw) : {};
    } catch {
      cache = {};
    }
    cache[key] = entry;
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  }

  async loadHome(location: WeatherLocation | null) {
    await this.load('home', location);
  }

  async loadTrip(location: WeatherLocation | null) {
    await this.load('trip', location);
  }

  private async load(key: 'home' | 'trip', location: WeatherLocation | null) {
    if (!location) {
      this[key] = emptyState();
      return;
    }

    const current = this[key];
    this[key] = { ...current, loading: true };

    const snapshot = await fetchWeatherSnapshot(location.latitude, location.longitude);

    if (snapshot) {
      const fetchedAt = new Date().toISOString();
      this[key] = { snapshot, fetchedAt, locationName: location.name, stale: false, loading: false, unavailable: false };
      this.persistCache(key, { snapshot, fetchedAt, locationName: location.name });
    } else if (current.snapshot) {
      // Fetch failed, but we have something to show - keep it, just mark it stale.
      this[key] = { ...current, loading: false, stale: true };
    } else {
      this[key] = { ...emptyState(), unavailable: true };
    }
  }
}

function cachedEntryToState(entry: CachedEntry): WeatherState {
  return {
    snapshot: entry.snapshot,
    fetchedAt: entry.fetchedAt,
    locationName: entry.locationName,
    // Anything read from a previous session's cache is unconfirmed until this session's own fetch succeeds.
    stale: true,
    loading: false,
    unavailable: false,
  };
}

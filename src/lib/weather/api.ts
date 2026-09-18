/**
 * Open-Meteo fetch wrappers (UI_PLAN.md §5.5) - the only network dependency
 * in an otherwise fully local-first app. No API key needed for
 * non-commercial use. Deliberately isolated in their own module, calling
 * the global `fetch` directly with no other side effects, so
 * `weatherStore.svelte.ts` (the caller, which owns caching/staleness/error
 * handling) can mock this module in tests rather than mocking `fetch`
 * itself.
 */

export interface GeocodeResult {
  name: string;
  /** e.g. "DE" - used to build a short display label like "Munich, DE". */
  countryCode?: string;
  latitude: number;
  longitude: number;
}

export interface DailyForecastDay {
  /** ISO date "YYYY-MM-DD". */
  date: string;
  weatherCode: number;
  tempMaxC: number;
  tempMinC: number;
}

export interface WeatherSnapshot {
  currentTempC: number;
  currentWeatherCode: number;
  /** Today first, six days after - Open-Meteo's own default forecast window. */
  daily: DailyForecastDay[];
}

/**
 * City name -> candidate locations, via Open-Meteo's geocoding endpoint.
 * Called once, at the moment the user sets a location (UI_PLAN.md §5.5) -
 * normal day-to-day operation never calls this, only `fetchWeatherSnapshot`.
 * Returns an empty array (never throws) on a network failure or an
 * unrecognised city name - the caller decides how to present "no matches".
 */
export async function geocodeCity(query: string): Promise<GeocodeResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(trimmed)}&count=5&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.results)) return [];

    return data.results
      .filter((r: any) => typeof r?.latitude === 'number' && typeof r?.longitude === 'number' && typeof r?.name === 'string')
      .map((r: any) => ({
        name: r.admin1 ? `${r.name}, ${r.admin1}` : r.name,
        countryCode: typeof r.country_code === 'string' ? r.country_code : undefined,
        latitude: r.latitude,
        longitude: r.longitude,
      }));
  } catch {
    return [];
  }
}

/**
 * Current conditions + a 7-day daily forecast for one lat/lon, via Open-
 * Meteo's forecast endpoint. Uses the simple `current_weather=true` flag
 * (still fully supported, and its exact response shape is unambiguous)
 * rather than the newer unified `current=`/`hourly=` parameters, whose
 * field names are less certain without a live call to verify against.
 * Returns `null` (never throws) on any network failure or unexpected
 * response shape - the caller is responsible for falling back to a cached
 * snapshot or an "absent" state, per §5.5's "must degrade to absent, never
 * broken."
 */
export async function fetchWeatherSnapshot(latitude: number, longitude: number): Promise<WeatherSnapshot | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&temperature_unit=celsius&timezone=auto&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();

    const current = data?.current_weather;
    const daily = data?.daily;
    if (
      typeof current?.temperature !== 'number' ||
      typeof current?.weathercode !== 'number' ||
      !Array.isArray(daily?.time) ||
      !Array.isArray(daily?.weathercode) ||
      !Array.isArray(daily?.temperature_2m_max) ||
      !Array.isArray(daily?.temperature_2m_min)
    ) {
      return null;
    }

    const days: DailyForecastDay[] = daily.time.map((date: string, i: number) => ({
      date,
      weatherCode: daily.weathercode[i],
      tempMaxC: daily.temperature_2m_max[i],
      tempMinC: daily.temperature_2m_min[i],
    }));

    return {
      currentTempC: current.temperature,
      currentWeatherCode: current.weathercode,
      daily: days,
    };
  } catch {
    return null;
  }
}

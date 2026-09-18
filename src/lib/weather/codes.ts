/**
 * WMO weather-interpretation codes (the values Open-Meteo's `weathercode`
 * field returns) mapped to a short label and an Iconify icon name.
 * Standard table, not this app's own invention - see
 * https://open-meteo.com/en/docs (WMO Weather interpretation codes).
 * Pure data + a pure lookup, no network - fully unit-testable on its own,
 * per UI_PLAN.md §5.5's "pure fetch wrappers... isolated and mockable"
 * (the network call is the *other* half; this half never touches it).
 */

export interface WeatherCodeInfo {
  label: string;
  icon: string;
}

const WEATHER_CODES: Record<number, WeatherCodeInfo> = {
  0: { label: 'Clear sky', icon: 'ic:baseline-wb-sunny' },
  1: { label: 'Mainly clear', icon: 'ic:baseline-wb-sunny' },
  2: { label: 'Partly cloudy', icon: 'ic:baseline-wb-cloudy' },
  3: { label: 'Overcast', icon: 'ic:baseline-cloud' },
  45: { label: 'Fog', icon: 'ic:baseline-foggy' },
  48: { label: 'Depositing rime fog', icon: 'ic:baseline-foggy' },
  51: { label: 'Light drizzle', icon: 'ic:baseline-grain' },
  53: { label: 'Moderate drizzle', icon: 'ic:baseline-grain' },
  55: { label: 'Dense drizzle', icon: 'ic:baseline-grain' },
  56: { label: 'Light freezing drizzle', icon: 'ic:baseline-ac-unit' },
  57: { label: 'Dense freezing drizzle', icon: 'ic:baseline-ac-unit' },
  61: { label: 'Slight rain', icon: 'ic:baseline-water-drop' },
  63: { label: 'Moderate rain', icon: 'ic:baseline-water-drop' },
  65: { label: 'Heavy rain', icon: 'ic:baseline-water-drop' },
  66: { label: 'Light freezing rain', icon: 'ic:baseline-ac-unit' },
  67: { label: 'Heavy freezing rain', icon: 'ic:baseline-ac-unit' },
  71: { label: 'Slight snow fall', icon: 'ic:baseline-ac-unit' },
  73: { label: 'Moderate snow fall', icon: 'ic:baseline-ac-unit' },
  75: { label: 'Heavy snow fall', icon: 'ic:baseline-ac-unit' },
  77: { label: 'Snow grains', icon: 'ic:baseline-ac-unit' },
  80: { label: 'Slight rain showers', icon: 'ic:baseline-water-drop' },
  81: { label: 'Moderate rain showers', icon: 'ic:baseline-water-drop' },
  82: { label: 'Violent rain showers', icon: 'ic:baseline-water-drop' },
  85: { label: 'Slight snow showers', icon: 'ic:baseline-ac-unit' },
  86: { label: 'Heavy snow showers', icon: 'ic:baseline-ac-unit' },
  95: { label: 'Thunderstorm', icon: 'ic:baseline-thunderstorm' },
  96: { label: 'Thunderstorm, slight hail', icon: 'ic:baseline-thunderstorm' },
  99: { label: 'Thunderstorm, heavy hail', icon: 'ic:baseline-thunderstorm' },
};

const UNKNOWN_CODE: WeatherCodeInfo = { label: 'Unknown', icon: 'ic:baseline-cloud-queue' };

/** Never throws - an unrecognised code (a future WMO addition, corrupt cache, etc.) degrades to a generic "Unknown" rather than breaking the card. */
export function describeWeatherCode(code: number): WeatherCodeInfo {
  return WEATHER_CODES[code] ?? UNKNOWN_CODE;
}

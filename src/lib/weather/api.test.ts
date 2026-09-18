import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geocodeCity, fetchWeatherSnapshot } from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe("geocodeCity", () => {
  it("returns an empty array for a blank query, without calling fetch", async () => {
    expect(await geocodeCity("   ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a successful response into GeocodeResult[]", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          { name: "Munich", admin1: "Bavaria", country_code: "DE", latitude: 48.1374, longitude: 11.5755 },
          { name: "Fontainebleau", country_code: "FR", latitude: 48.4042, longitude: 2.7017 },
        ],
      }),
    );

    const results = await geocodeCity("Munich");

    expect(results).toEqual([
      { name: "Munich, Bavaria", countryCode: "DE", latitude: 48.1374, longitude: 11.5755 },
      { name: "Fontainebleau", countryCode: "FR", latitude: 48.4042, longitude: 2.7017 },
    ]);
  });

  it("returns an empty array (never throws) on a non-ok response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    await expect(geocodeCity("Nowhere")).resolves.toEqual([]);
  });

  it("returns an empty array (never throws) when fetch itself rejects", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(geocodeCity("Munich")).resolves.toEqual([]);
  });

  it("returns an empty array for an unexpected response shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: "not an array" }));
    await expect(geocodeCity("Munich")).resolves.toEqual([]);
  });
});

describe("fetchWeatherSnapshot", () => {
  const validBody = {
    current_weather: { temperature: 18.5, weathercode: 2 },
    daily: {
      time: ["2026-09-18", "2026-09-19"],
      weathercode: [2, 61],
      temperature_2m_max: [22, 19],
      temperature_2m_min: [12, 11],
    },
  };

  it("maps a successful response into a WeatherSnapshot", async () => {
    fetchMock.mockResolvedValue(jsonResponse(validBody));

    const result = await fetchWeatherSnapshot(48.1374, 11.5755);

    expect(result).toEqual({
      currentTempC: 18.5,
      currentWeatherCode: 2,
      daily: [
        { date: "2026-09-18", weatherCode: 2, tempMaxC: 22, tempMinC: 12 },
        { date: "2026-09-19", weatherCode: 61, tempMaxC: 19, tempMinC: 11 },
      ],
    });
  });

  it("returns null (never throws) on a non-ok response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    await expect(fetchWeatherSnapshot(0, 0)).resolves.toBeNull();
  });

  it("returns null (never throws) when fetch itself rejects", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(fetchWeatherSnapshot(0, 0)).resolves.toBeNull();
  });

  it("returns null for a response missing expected fields", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ current_weather: {} }));
    await expect(fetchWeatherSnapshot(0, 0)).resolves.toBeNull();
  });
});

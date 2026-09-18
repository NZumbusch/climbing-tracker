import { describe, it, expect } from "vitest";
import { describeWeatherCode } from "./codes";

describe("describeWeatherCode", () => {
  it("resolves known WMO codes to a label and icon", () => {
    expect(describeWeatherCode(0)).toEqual({ label: "Clear sky", icon: "ic:baseline-wb-sunny" });
    expect(describeWeatherCode(95)).toEqual({ label: "Thunderstorm", icon: "ic:baseline-thunderstorm" });
  });

  it("degrades to a generic 'Unknown' for an unrecognised code, never throwing", () => {
    expect(() => describeWeatherCode(-1)).not.toThrow();
    expect(describeWeatherCode(12345)).toEqual({ label: "Unknown", icon: "ic:baseline-cloud-queue" });
  });
});

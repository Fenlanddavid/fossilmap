import { describe, expect, it } from "vitest";
import { formatOsGridRef, isInGreatBritainBounds, parseOsGridRef } from "./osGrid";

describe("osGrid", () => {
  it("formats WGS84 coordinates as an 8-figure OS grid reference", () => {
    expect(formatOsGridRef(52.65798, 1.71605, 8)).toBe("TG 5140 1317");
  });

  it("does not format coordinates outside Great Britain", () => {
    expect(isInGreatBritainBounds(40.7128, -74.006)).toBe(false);
    expect(formatOsGridRef(40.7128, -74.006, 8)).toBeNull();
  });

  it("parses an OS grid reference into WGS84 coordinates", () => {
    const parsed = parseOsGridRef("TG 5140 1317");
    expect(parsed.lat).toBeGreaterThan(52.65);
    expect(parsed.lat).toBeLessThan(52.67);
    expect(parsed.lon).toBeGreaterThan(1.70);
    expect(parsed.lon).toBeLessThan(1.73);
  });

  it("rejects invalid OS grid references", () => {
    expect(() => parseOsGridRef("not a grid ref")).toThrow("Enter a valid OS grid reference");
  });
});

import { describe, expect, it } from "vitest";
import { formatDisplayDate } from "./dates";

describe("formatDisplayDate", () => {
  it("formats valid dates for display", () => {
    expect(formatDisplayDate("2026-02-20T12:00:00.000Z")).toBe("20 Feb 2026");
  });

  it("uses a fallback for missing or invalid dates", () => {
    expect(formatDisplayDate("")).toBe("Date not recorded");
    expect(formatDisplayDate("not-a-date")).toBe("Date not recorded");
  });
});

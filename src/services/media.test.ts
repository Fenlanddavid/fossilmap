import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  where: vi.fn(),
  equals: vi.fn(),
  sortBy: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    media: {
      where: dbMocks.where,
    },
  },
}));

function mockMediaRows(rows: Array<{ id: string; createdAt: string }>) {
  dbMocks.where.mockReturnValue({ equals: dbMocks.equals });
  dbMocks.equals.mockReturnValue({
    sortBy: dbMocks.sortBy,
    limit: dbMocks.limit,
  });
  dbMocks.sortBy.mockResolvedValue(rows);
}

describe("media thumbnail lookups", () => {
  beforeEach(() => {
    dbMocks.where.mockReset();
    dbMocks.equals.mockReset();
    dbMocks.sortBy.mockReset();
    dbMocks.limit.mockReset();
  });

  it("selects the first specimen media after sorting by createdAt", async () => {
    mockMediaRows([
      { id: "earliest", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "later", createdAt: "2026-01-02T00:00:00.000Z" },
    ]);
    const { getFirstSpecimenMedia } = await import("./media");

    await expect(getFirstSpecimenMedia("specimen-1")).resolves.toMatchObject({ id: "earliest" });
    expect(dbMocks.where).toHaveBeenCalledWith("specimenId");
    expect(dbMocks.equals).toHaveBeenCalledWith("specimen-1");
    expect(dbMocks.sortBy).toHaveBeenCalledWith("createdAt");
    expect(dbMocks.limit).not.toHaveBeenCalled();
  });

  it("selects the first locality media after sorting by createdAt", async () => {
    mockMediaRows([
      { id: "earliest", createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "later", createdAt: "2026-01-02T00:00:00.000Z" },
    ]);
    const { getFirstLocalityMedia } = await import("./media");

    await expect(getFirstLocalityMedia("locality-1")).resolves.toMatchObject({ id: "earliest" });
    expect(dbMocks.where).toHaveBeenCalledWith("localityId");
    expect(dbMocks.equals).toHaveBeenCalledWith("locality-1");
    expect(dbMocks.sortBy).toHaveBeenCalledWith("createdAt");
    expect(dbMocks.limit).not.toHaveBeenCalled();
  });
});

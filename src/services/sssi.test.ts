import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSSSI } from "./sssi";

describe("checkSSSI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns an England SSSI result when Natural England returns a feature", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            attributes: {
              NAME: "Whitby Coast SSSI",
              REF_CODE: "1003507",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkSSSI(54.4858, -0.6206)).resolves.toEqual({
      isSSSI: true,
      siteName: "Whitby Coast SSSI",
      country: "england",
      notifiedFeatures: "Natural England SSSI reference 1003507",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("services.arcgis.com/JJzESW51TqeY9uat");
    expect(String(fetchMock.mock.calls[0][0])).toContain("geometry=-0.6206%2C54.4858");
  });

  it("returns nearby England SSSI details without marking the point as inside one", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          features: [
            {
              attributes: {
                NAME: "Runswick Bay SSSI",
                REF_CODE: "1003480",
              },
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkSSSI(54.5291571, -0.7175133)).resolves.toEqual({
      isSSSI: false,
      siteName: "",
      country: "england",
      nearbySiteName: "Runswick Bay SSSI",
      nearbySearchRadiusM: 3000,
    });
    expect(String(fetchMock.mock.calls[1][0])).toContain("distance=3000");
  });

  it("returns false for England when Natural England returns no features", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    }));

    await expect(checkSSSI(54.2, -1.1)).resolves.toEqual({
      isSSSI: false,
      siteName: "",
      country: "england",
    });
  });

  it("resolves to a non-SSSI unknown result on network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(checkSSSI(54.2, -1.1)).resolves.toEqual({
      isSSSI: false,
      siteName: "",
      country: "unknown",
    });
  });

  it("routes Scotland coordinates to NatureScot", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            attributes: {
              NAME: "Cromarty Firth SSSI",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkSSSI(57.681, -4.03)).resolves.toMatchObject({
      isSSSI: true,
      siteName: "Cromarty Firth SSSI",
      country: "scotland",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("services1.arcgis.com/LM9GyVFsughzHdbO");
  });

  it("returns the partial coverage note for Wales", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkSSSI(52.13, -4.55)).resolves.toEqual({
      isSSSI: false,
      siteName: "",
      country: "wales",
      notifiedFeatures: "Full Wales SSSI data not available - check NRW Lle portal",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { describe, expect, it, vi } from "vitest";
import { fetchVendorCases } from "./vendor-api";

describe("fetchVendorCases", () => {
  it("does not call fetch when the TestRail URL is private", async () => {
    const fetchMock = vi.fn();
    await expect(
      fetchVendorCases(
        "testrail",
        {
          baseUrl: "http://127.0.0.1:8080",
          token: "secret",
          email: "qa@example.com",
          project: "1",
        },
        { fetch: fetchMock },
      ),
    ).rejects.toThrow(/local or private address/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("paginates TestRail get_cases with mocked fetch only", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("get_sections")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sections: [{ id: 1, name: "Auth", parent_id: null }] }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          cases: [{ id: 5, title: "From API", section_id: 1, priority_id: 4 }],
        }),
      };
    });
    const lookup = async () => [{ address: "8.8.8.8", family: 4 }];
    const json = await fetchVendorCases(
      "testrail",
      {
        baseUrl: "https://example.testrail.io",
        token: "api-key",
        email: "qa@example.com",
        project: "1",
      },
      { fetch: fetchMock as unknown as typeof fetch, lookup },
    );
    const parsed = JSON.parse(json) as { cases: Array<{ id: number }> };
    expect(parsed.cases).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("get_cases/1");
  });

  it("refuses Xray live API and never fetches", async () => {
    const fetchMock = vi.fn();
    await expect(
      fetchVendorCases(
        "xray",
        { baseUrl: "https://xray.cloud.getxray.app", token: "id" },
        { fetch: fetchMock },
      ),
    ).rejects.toThrow(/CSV or JSON export/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

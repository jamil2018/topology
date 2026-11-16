import { expect, it, vi } from "vitest";
import { IssueHttpError, providerFetch, readJson } from "./http";

for (const status of [401, 403, 404, 429, 500, 503]) {
  it(`preserves HTTP ${status} without treating its payload as success`, async () => {
    const fetch = vi.fn(async () => new Response("controlled failure", { status }));
    const response = await providerFetch({ fetch }, "https://provider.example/issues/1");
    await expect(readJson(response)).rejects.toMatchObject({ name: "IssueHttpError", status, body: "controlled failure" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
}

it("rejects malformed JSON and propagates a transport timeout", async () => {
  await expect(readJson(new Response('{"broken":'))).rejects.toBeInstanceOf(SyntaxError);
  const timeout = new DOMException("Controlled provider deadline", "TimeoutError");
  await expect(providerFetch({ fetch: vi.fn().mockRejectedValue(timeout) }, "https://provider.example/issues/1")).rejects.toBe(timeout);
});

it("allows a caller to retry a rate-limited read without replaying a write", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("rate limited", { status: 429 })).mockResolvedValueOnce(Response.json({ id: "remote-1", title: "Recovered" }));
  const config = { fetch };
  const read = async () => readJson(await providerFetch(config, "https://provider.example/issues/1"));
  await expect(read()).rejects.toBeInstanceOf(IssueHttpError);
  await expect(read()).resolves.toEqual({ id: "remote-1", title: "Recovered" });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
});

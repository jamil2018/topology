import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("@/db", () => ({
  db: {
    execute: (...args: unknown[]) => execute(...args),
  },
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    execute.mockReset();
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it("omits attachmentsDir and raw db errors in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.ATTACHMENTS_DIR = "/secret/attachments";
    process.env.ATTACHMENTS_DRIVER = "local";
    execute.mockRejectedValueOnce(
      new Error("password authentication failed for user topology"),
    );

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({
      status: "degraded",
      database: "error",
      attachmentsDriver: "local",
      uptimeHintMs: expect.any(Number),
    });
    expect(body).not.toHaveProperty("attachmentsDir");
    expect(body).not.toHaveProperty("error");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("includes diagnostics outside production", async () => {
    process.env.NODE_ENV = "test";
    process.env.ATTACHMENTS_DIR = "./data/attachments";
    execute.mockRejectedValueOnce(new Error("connection refused"));

    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.attachmentsDir).toBe("./data/attachments");
    expect(body.error).toBe("connection refused");
  });

  it("returns ok when the database answers", async () => {
    process.env.NODE_ENV = "production";
    execute.mockResolvedValueOnce([]);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.database).toBe("ok");
    expect(body).not.toHaveProperty("attachmentsDir");
  });
});

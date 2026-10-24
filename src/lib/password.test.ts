import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  passwordSchema,
  passwordTooShort,
} from "./password";

describe("password policy", () => {
  it("requires at least 12 characters", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(passwordTooShort("short")).toBe(true);
    expect(passwordTooShort("topology-demo")).toBe(false);
    expect(passwordSchema.safeParse("12345678901").success).toBe(false);
    expect(passwordSchema.safeParse("123456789012").success).toBe(true);
  });
});

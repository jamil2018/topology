import { z } from "zod";

/** Browser-safe password rules (no Node APIs). */

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH);

export function passwordTooShort(value: string): boolean {
  return value.length < MIN_PASSWORD_LENGTH;
}

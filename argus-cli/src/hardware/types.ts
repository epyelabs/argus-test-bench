/**
 * Common result shape for hardware detection / reads.
 *
 * Screens render `available: false` as a calm "not present / tool missing"
 * state instead of crashing — important because the same code runs on macOS
 * (no hardware, no tools) during development.
 */
export type HalResult<T> =
  | { available: true; data: T }
  | { available: false; reason: string };

export function ok<T>(data: T): HalResult<T> {
  return { available: true, data };
}

export function unavailable<T>(reason: string): HalResult<T> {
  return { available: false, reason };
}

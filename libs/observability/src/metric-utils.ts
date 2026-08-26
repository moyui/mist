const registrationRegistry = new Set<string>();

/**
 * Ensures a metric registration block is executed at most once per process lifetime.
 */
export function createIdempotentMetricRegistration(
  key: string,
  registerFn: () => void,
): boolean {
  if (registrationRegistry.has(key)) {
    return false;
  }
  registerFn();
  registrationRegistry.add(key);
  return true;
}

/**
 * Resets the registration registry (for unit testing purposes).
 */
export function resetMetricRegistrationsForTest(): void {
  registrationRegistry.clear();
}

/**
 * Sanitizes a string for use as a low-cardinality OTel label.
 */
export function sanitizeLowCardinalityLabel(
  value: string | null | undefined,
  fallback = 'unknown',
): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return fallback;
  // Disallow invalid characters or high-cardinality values
  return trimmed;
}

/**
 * Converts a potentially nullish or non-finite duration/count into a safe number for OTel observation.
 */
export function safeMetricNumber(
  value: number | null | undefined,
  fallback = 0,
): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    !Number.isNaN(value)
  ) {
    return value;
  }
  return fallback;
}

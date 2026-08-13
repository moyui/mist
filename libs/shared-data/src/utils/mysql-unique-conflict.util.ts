/**
 * MySQL unique-constraint violation detection (remediate-alert-delivery-integrity).
 *
 * Shared by the signal app (AlertEvent dedupe on commit) and the notification app
 * (per-channel delivery row fanout race) so the ER_DUP_ENTRY interpretation is
 * defined once — two local copies had started to drift.
 */

interface MySqlDriverErrorLike {
  code?: unknown;
  errno?: unknown;
  sqlMessage?: unknown;
}

/** True when `error` is an ER_DUP_ENTRY (errno 1062) on the named constraint. */
export function isUniqueConstraintViolation(
  error: unknown,
  constraintName: string,
): boolean {
  if (!(error instanceof Error)) return false;
  const driver = (error as { driverError?: MySqlDriverErrorLike }).driverError;
  if (!driver) return false;
  if (driver.code !== 'ER_DUP_ENTRY' || driver.errno !== 1062) return false;
  if (typeof driver.sqlMessage !== 'string') return false;
  const match = /for key '([^']+)'\s*$/.exec(driver.sqlMessage);
  if (!match) return false;
  const exactName = match[1].split('.').at(-1);
  return exactName === constraintName;
}

import { parseISO } from 'date-fns';
import { BEIJING_DATE_REGEX } from '@app/timezone';

// Error codes moved to @app/constants

/**
 * Validation helper functions for MCP tools
 */
export class ValidationHelper {
  /**
   * Validate date range (start < end)
   *
   * @param startDate - Start date string (ISO format or YYYY-MM-DD)
   * @param endDate - End date string (ISO format or YYYY-MM-DD)
   * @returns Error message if invalid, null if valid
   */
  static validateDateRange(
    startDate: string | undefined,
    endDate: string | undefined,
  ): string | null {
    if (!startDate || !endDate) {
      return null; // Optional parameters, skip validation
    }

    if (!BEIJING_DATE_REGEX.test(startDate)) {
      return `Invalid startDate format: "${startDate}". Expected YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.`;
    }

    if (!BEIJING_DATE_REGEX.test(endDate)) {
      return `Invalid endDate format: "${endDate}". Expected YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.`;
    }

    const start = parseISO(
      startDate.includes(' ')
        ? startDate.replace(' ', 'T') + '+08:00'
        : startDate + 'T00:00:00+08:00',
    );
    const end = parseISO(
      endDate.includes(' ')
        ? endDate.replace(' ', 'T') + '+08:00'
        : endDate + 'T00:00:00+08:00',
    );

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return `Invalid date values. Start: "${startDate}", End: "${endDate}".`;
    }

    if (start >= end) {
      return `Invalid date range: start date (${startDate}) must be before end date (${endDate}).`;
    }

    return null;
  }

  /**
   * Validate period parameter (positive integer)
   *
   * @param period - Period value to validate
   * @param paramName - Parameter name for error message
   * @param min - Minimum allowed value (default: 1)
   * @param max - Maximum allowed value (optional)
   * @returns Error message if invalid, null if valid
   */
  static validatePeriod(
    period: number,
    paramName: string = 'period',
    min: number = 1,
    max?: number,
  ): string | null {
    if (!Number.isInteger(period)) {
      return `${paramName} must be an integer, received: ${period}.`;
    }

    if (period < min) {
      return `${paramName} must be at least ${min}, received: ${period}.`;
    }

    if (max !== undefined && period > max) {
      return `${paramName} must be at most ${max}, received: ${period}.`;
    }

    return null;
  }

  /**
   * Validate array has minimum length
   *
   * @param array - Array to validate
   * @param minLength - Minimum required length
   * @param arrayName - Array name for error message
   * @returns Error message if invalid, null if valid
   */
  static validateMinLength(
    array: any[],
    minLength: number,
    arrayName: string = 'data',
  ): string | null {
    if (!Array.isArray(array)) {
      return `${arrayName} must be an array.`;
    }

    if (array.length < minLength) {
      return `${arrayName} must contain at least ${minLength} elements, received: ${array.length}.`;
    }

    return null;
  }

  /**
   * Validate array lengths match
   *
   * @param arrays - Arrays to validate
   * @param arrayNames - Names of arrays for error message
   * @returns Error message if invalid, null if valid
   */
  static validateMatchingLengths(
    arrays: any[][],
    arrayNames: string[],
  ): string | null {
    if (arrays.length < 2) {
      return null; // Need at least 2 arrays to compare
    }

    const firstLength = arrays[0].length;

    for (let i = 1; i < arrays.length; i++) {
      if (arrays[i].length !== firstLength) {
        return `Array length mismatch: ${arrayNames[0]} has ${firstLength} elements, but ${arrayNames[i]} has ${arrays[i].length} elements. All arrays must have the same length.`;
      }
    }

    return null;
  }

  /**
   * Sanitize string input (trim whitespace)
   *
   * @param value - String value to sanitize
   * @returns Sanitized string or null if empty/undefined
   */
  static sanitizeString(value: string | undefined): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  /**
   * Validate symbol format (non-empty string after sanitization)
   *
   * @param symbol - Symbol to validate
   * @returns Error message if invalid, null if valid
   */
  static validateSymbol(symbol: string): string | null {
    const sanitized = this.sanitizeString(symbol);

    if (!sanitized) {
      return 'Symbol cannot be empty or contain only whitespace.';
    }

    if (sanitized.length !== symbol.length) {
      return `Symbol contains leading/trailing whitespace. Use "${sanitized}" instead.`;
    }

    return null;
  }

  /**
   * Validate limit parameter (positive integer)
   *
   * @param limit - Limit value to validate
   * @param max - Maximum allowed value (optional)
   * @returns Error message if invalid, null if valid
   */
  static validateLimit(limit: number, max?: number): string | null {
    return this.validatePeriod(limit, 'limit', 1, max);
  }

  /**
   * Validate prices array (non-empty, all numbers)
   *
   * @param prices - Prices array to validate
   * @param arrayName - Array name for error message
   * @returns Error message if invalid, null if valid
   */
  static validatePrices(
    prices: number[],
    arrayName: string = 'prices',
  ): string | null {
    const minLengthError = this.validateMinLength(prices, 1, arrayName);
    if (minLengthError) {
      return minLengthError;
    }

    for (let i = 0; i < prices.length; i++) {
      if (typeof prices[i] !== 'number' || isNaN(prices[i])) {
        return `${arrayName}[${i}] is not a valid number: ${prices[i]}.`;
      }
    }

    return null;
  }
}

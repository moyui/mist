#!/usr/bin/env node

/**
 * Data Validator - Validate test data
 */

import { logInfo, logSuccess, logError } from './utils.mjs';

export class DataValidator {
  constructor() {
    this.validationResults = [];
  }

  /**
   * Validate K-line data
   */
  validateKLineData(data, options = {}) {
    const { minRecords = 1, requireDaily = false } = options;
    const results = {
      valid: true,
      issues: [],
      stats: {
        recordCount: data?.length ?? 0,
        dateRange: null,
        symbols: []
      }
    };

    if (!Array.isArray(data)) {
      results.valid = false;
      results.issues.push('Data is not an array');
      return results;
    }

    if (data.length < minRecords) {
      results.valid = false;
      results.issues.push(`Expected at least ${minRecords} records, got ${data.length}`);
    }

    // Check data structure
    if (data.length > 0) {
      const sample = data[0];
      const requiredFields = ['time', 'open', 'highest', 'lowest', 'close'];
      const missing = requiredFields.filter(f => !(f in sample));

      if (missing.length > 0) {
        results.valid = false;
        results.issues.push(`Missing fields: ${missing.join(', ')}`);
      }

      // Calculate stats
      results.stats.dateRange = {
        start: data[0].time,
        end: data[data.length - 1].time
      };

      const symbols = new Set(data.map(d => d.symbol || d.code));
      results.stats.symbols = Array.from(symbols);
    }

    return results;
  }

  /**
   * Validate indicator data (MACD, KDJ, RSI)
   */
  validateIndicatorData(data, indicatorType) {
    const results = {
      valid: true,
      issues: [],
      stats: { recordCount: data?.length ?? 0 }
    };

    if (!Array.isArray(data)) {
      results.valid = false;
      results.issues.push('Data is not an array');
      return results;
    }

    // Type-specific validations
    switch (indicatorType) {
      case 'MACD':
        this.validateMACD(data, results);
        break;
      case 'KDJ':
        this.validateKDJ(data, results);
        break;
      case 'RSI':
        this.validateRSI(data, results);
        break;
    }

    return results;
  }

  validateMACD(data, results) {
    for (let i = 0; i < data.length; i++) {
      const { macd, signal, histogram } = data[i];

      // Check histogram calculation
      if (macd != null && signal != null && histogram != null) {
        const expected = macd - signal;
        if (Math.abs(histogram - expected) > 0.01) {
          results.valid = false;
          results.issues.push(`Index ${i}: histogram mismatch (expected ${expected}, got ${histogram})`);
        }
      }
    }
  }

  validateKDJ(data, results) {
    for (let i = 0; i < data.length; i++) {
      const { k, d, j } = data[i];

      // K and D should be in 0-100 range
      if (k != null && (k < 0 || k > 100)) {
        results.valid = false;
        results.issues.push(`Index ${i}: K value ${k} out of range [0, 100]`);
      }

      if (d != null && (d < 0 || d > 100)) {
        results.valid = false;
        results.issues.push(`Index ${i}: D value ${d} out of range [0, 100]`);
      }

      // J can exceed range
      if (j != null && typeof j !== 'number') {
        results.valid = false;
        results.issues.push(`Index ${i}: J value is not a number`);
      }
    }
  }

  validateRSI(data, results) {
    for (let i = 0; i < data.length; i++) {
      const { rsi } = data[i];

      if (rsi != null && (rsi < 0 || rsi > 100)) {
        results.valid = false;
        results.issues.push(`Index ${i}: RSI value ${rsi} out of range [0, 100]`);
      }
    }
  }

  /**
   * Validate Chan Theory data
   */
  validateChanData(data, chanType) {
    const results = {
      valid: true,
      issues: [],
      stats: { recordCount: data?.length ?? 0 }
    };

    if (!Array.isArray(data)) {
      results.valid = false;
      results.issues.push('Data is not an array');
      return results;
    }

    switch (chanType) {
      case 'merge-k':
        this.validateMergeK(data, results);
        break;
      case 'bi':
        this.validateBi(data, results);
        break;
      case 'channel':
        this.validateChannel(data, results);
        break;
    }

    return results;
  }

  validateMergeK(data, results) {
    // Merged K should have direction field
    for (let i = 0; i < data.length; i++) {
      if (!('direction' in data[i])) {
        results.valid = false;
        results.issues.push(`Index ${i}: missing direction field`);
      }
    }
  }

  validateBi(data, results) {
    // Bi should have start/end points and direction
    for (let i = 0; i < data.length; i++) {
      const bi = data[i];
      if (!('direction' in bi)) {
        results.valid = false;
        results.issues.push(`Bi ${i}: missing direction`);
      }
      if (!('startIdx' in bi) || !('endIdx' in bi)) {
        results.valid = false;
        results.issues.push(`Bi ${i}: missing start/end index`);
      }
    }
  }

  validateChannel(data, results) {
    // Channel should have high and low bounds
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (!('high' in ch) || !('low' in ch)) {
        results.valid = false;
        results.issues.push(`Channel ${i}: missing high/low bounds`);
      }
      if (ch.high < ch.low) {
        results.valid = false;
        results.issues.push(`Channel ${i}: high ${ch.high} < low ${ch.low}`);
      }
    }
  }
}

#!/usr/bin/env node

/**
 * API Tester - Test API endpoints
 */

import axios from 'axios';
import { logInfo, logSuccess, logError, logWarning } from './utils.mjs';

export class APITester {
  constructor(baseUrl = 'http://localhost:8001') {
    this.baseUrl = baseUrl;
    this.results = [];
  }

  /**
   * Test a single endpoint
   */
  async testEndpoint(testCase) {
    const {
      name,
      endpoint,
      method = 'POST',
      body,
      validations = []
    } = testCase;

    logInfo(`Testing: ${name}`);

    const startTime = Date.now();
    const result = {
      name,
      endpoint,
      method,
      success: true,
      responseTime: 0,
      data: null,
      validations: [],
      error: null
    };

    try {
      const response = await axios({
        method,
        url: `${this.baseUrl}${endpoint}`,
        data: body,
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });

      result.responseTime = Date.now() - startTime;
      result.data = response.data;
      result.status = response.status;

      // Run validations
      for (const validation of validations) {
        const vResult = this.runValidation(validation, response.data);
        result.validations.push(vResult);
        if (!vResult.passed) {
          result.success = false;
        }
      }

      if (result.success) {
        logSuccess(`${name} - PASSED (${result.responseTime}ms)`);
      } else {
        logWarning(`${name} - VALIDATION FAILED`);
      }

    } catch (error) {
      result.responseTime = Date.now() - startTime;
      result.success = false;
      result.error = {
        message: error.message,
        code: error.code,
        status: error.response?.status
      };
      logError(`${name} - FAILED: ${error.message}`);
    }

    this.results.push(result);
    return result;
  }

  /**
   * Run a validation
   */
  runValidation(validation, data) {
    const { name, check } = validation;
    let passed = false;
    let details = '';

    if (typeof check === 'function') {
      try {
        const result = check(data);
        passed = result.passed ?? result === true;
        details = result.details ?? (result === true ? 'OK' : 'Failed');
      } catch (error) {
        passed = false;
        details = error.message;
      }
    } else if (typeof check === 'string') {
      // Simple expression evaluation
      try {
        passed = eval(check);
        details = passed ? 'OK' : 'Failed';
      } catch (error) {
        passed = false;
        details = error.message;
      }
    }

    return { name, passed, details };
  }

  /**
   * Run multiple test cases
   */
  async runTests(testCases) {
    this.results = [];

    for (const testCase of testCases) {
      await this.testEndpoint(testCase);
    }

    return {
      total: this.results.length,
      passed: this.results.filter(r => r.success).length,
      failed: this.results.filter(r => !r.success).length,
      results: this.results
    };
  }

  /**
   * Get summary
   */
  getSummary() {
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;

    return {
      total: this.results.length,
      passed,
      failed,
      passRate: this.results.length > 0 ? (passed / this.results.length * 100).toFixed(2) + '%' : '0%'
    };
  }
}

// Built-in validators
export const validators = {
  hasData: (data) => ({
    passed: Array.isArray(data) && data.length > 0,
    details: `Found ${data?.length ?? 0} records`
  }),

  hasRequiredFields: (data) => {
    if (!Array.isArray(data) || data.length === 0) {
      return { passed: false, details: 'No data to validate' };
    }
    const required = ['time', 'open', 'highest', 'lowest', 'close', 'amount'];
    const sample = data[0];
    const missing = required.filter(f => !(f in sample));
    return {
      passed: missing.length === 0,
      details: missing.length === 0 ? 'All fields present' : `Missing: ${missing.join(', ')}`
    };
  },

  isTimeSorted: (data) => {
    if (!Array.isArray(data) || data.length < 2) {
      return { passed: true, details: 'Not enough data to check' };
    }
    for (let i = 1; i < data.length; i++) {
      if (data[i].time < data[i-1].time) {
        return { passed: false, details: `Unsorted at index ${i-1} to ${i}` };
      }
    }
    return { passed: true, details: 'Time is sorted ascending' };
  }
};

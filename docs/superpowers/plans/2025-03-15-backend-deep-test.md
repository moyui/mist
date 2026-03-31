# 后端深度测试工具实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标:** 构建一套渐进式集成测试工具，通过真实数据验证 mist、mcp-server 和缠论算法的所有功能

**架构:** 采用渐进式集成测试方案，按照数据流向分层测试（基础设施→数据获取→技术指标→缠论算法→MCP工具），通过 AKTools 实时获取真实市场数据进行验证

**技术栈:** Node.js (ESM)、Jest、Axios、模板引擎、HTML/CSS

---

## 前置准备

### Task 0: 环境确认

**Step 1: 确认 Node.js 版本**

```bash
node --version
```
预期: v18+ 或 v20+

**Step 2: 确认项目依赖已安装**

```bash
cd /Users/xiyugao/code/mist/mist
ls node_modules
```
预期: node_modules 目录存在且非空

**Step 3: 确认测试配置**

```bash
cat package.json | grep -A 3 '"test"'
```
预期: 看到 Jest 相关配置

---

## 第一阶段：目录结构创建

### Task 1: 创建测试工具目录结构

**Files:**
- Create: `test-integration/deep-test/runner.mjs`
- Create: `test-integration/deep-test/lib/service-manager.mjs`
- Create: `test-integration/deep-test/lib/api-tester.mjs`
- Create: `test-integration/deep-test/lib/data-validator.mjs`
- Create: `test-integration/deep-test/lib/report-generator.mjs`
- Create: `test-integration/deep-test/lib/utils.mjs`
- Create: `test-integration/deep-test/templates/config-template.json`
- Create: `test-integration/deep-test/templates/report-template.html`

**Step 1: 创建主目录**

```bash
cd /Users/xiyugao/code/mist/mist
mkdir -p test-integration/deep-test/lib
mkdir -p test-integration/deep-test/templates
```

**Step 2: 创建空文件**

```bash
touch test-integration/deep-test/runner.mjs
touch test-integration/deep-test/lib/service-manager.mjs
touch test-integration/deep-test/lib/api-tester.mjs
touch test-integration/deep-test/lib/data-validator.mjs
touch test-integration/deep-test/lib/report-generator.mjs
touch test-integration/deep-test/lib/utils.mjs
touch test-integration/deep-test/templates/config-template.json
touch test-integration/deep-test/templates/report-template.html
```

**Step 3: 验证目录结构**

```bash
tree test-integration/deep-test -L 2
```
预期: 看到创建的文件结构

**Step 4: Commit**

```bash
git add test-integration/
git commit -m "feat: create deep test directory structure"
```

---

### Task 2: 删除废弃的 scripts 目录

**Files:**
- Delete: `scripts/convert-results.js`
- Delete: `scripts/`

**Step 1: 确认 scripts 目录内容**

```bash
ls -la scripts/
```
预期: 只看到 convert-results.js

**Step 2: 删除 scripts 目录**

```bash
rm -rf scripts/
```

**Step 3: 验证删除**

```bash
ls -la scripts/ 2>&1
```
预期: "No such file or directory"

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove obsolete scripts directory"
```

---

## 第二阶段：工具库实现

### Task 3: 实现工具函数库 (utils.mjs)

**Files:**
- Modify: `test-integration/deep-test/lib/utils.mjs`

**Step 1: 编写工具函数**

```javascript
#!/usr/bin/env node

/**
 * Utility functions for deep testing
 */

export const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

export function logInfo(...args) {
  log(colors.blue, 'ℹ️', ...args);
}

export function logSuccess(...args) {
  log(colors.green, '✅', ...args);
}

export function logError(...args) {
  log(colors.red, '❌', ...args);
}

export function logWarning(...args) {
  log(colors.yellow, '⚠️', ...args);
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatDate(date) {
  return date.toISOString().split('T')[0];
}

export function formatDateTime(date) {
  return date.toISOString().replace('T', ' ').split('.')[0];
}

export async function waitFor(condition, timeout = 30000, interval = 500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await sleep(interval);
  }
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

export function createDirectories(paths) {
  for (const path of paths) {
    const dir = path.substring(0, path.lastIndexOf('/'));
    if (dir && !fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

import fs from 'fs';
import path from 'path';

export function saveJSON(filepath, data) {
  createDirectories([filepath]);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
}

export function loadJSON(filepath) {
  if (!fs.existsSync(filepath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

export function createSymlink(target, link) {
  try {
    if (fs.existsSync(link)) {
      fs.unlinkSync(link);
    }
    fs.symlinkSync(path.resolve(target), link, 'dir');
  } catch (error) {
    logWarning('Failed to create symlink:', error.message);
  }
}
```

**Step 2: 验证语法**

```bash
node test-integration/deep-test/lib/utils.mjs
```
预期: 无语法错误

**Step 3: Commit**

```bash
git add test-integration/deep-test/lib/utils.mjs
git commit -m "feat: add utility functions for deep testing"
```

---

### Task 4: 实现服务管理器 (service-manager.mjs)

**Files:**
- Modify: `test-integration/deep-test/lib/service-manager.mjs`

**Step 1: 编写服务管理器**

```javascript
#!/usr/bin/env node

/**
 * Service Manager - Start/Stop test services
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { sleep, waitFor, logInfo, logSuccess, logError, logWarning } from './utils.mjs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const projectRoot = path.resolve(__dirname, '../../..');

export class ServiceManager {
  constructor() {
    this.processes = [];
    this.projectRoot = projectRoot;
  }

  /**
   * Check if a command exists
   */
  commandExists(cmd) {
    try {
      execSync(`which ${cmd}`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a port is in use
   */
  isPortInUse(port) {
    try {
      execSync(`lsof -i :${port} -t`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for a port to be open
   */
  async waitForPort(port, name, timeout = 30000) {
    logInfo(`Waiting for ${name} on port ${port}...`);
    try {
      await waitFor(
        () => this.isPortInUse(port),
        timeout,
        500
      );
      logSuccess(`${name} is ready on port ${port}`);
      return true;
    } catch (error) {
      throw new Error(`${name} failed to start on port ${port}`);
    }
  }

  /**
   * Start AKTools Python server
   */
  async startAKTools() {
    logInfo('Starting AKTools...');

    // Check Python
    if (!this.commandExists('python3')) {
      throw new Error('Python3 not found. Please install Python3.');
    }

    // Check if AKTools is already running
    if (this.isPortInUse(8080)) {
      logWarning('AKTools is already running on port 8080');
      return;
    }

    // Check if virtual environment exists
    const venvPath = path.join(this.projectRoot, 'python-env');
    let pythonCmd = 'python3';

    if (fs.existsSync(venvPath)) {
      const isDarwin = process.platform === 'darwin';
      const activatePath = isDarwin
        ? path.join(venvPath, 'bin', 'activate')
        : path.join(venvPath, 'Scripts', 'activate');

      if (fs.existsSync(activatePath)) {
        pythonCmd = path.join(isDarwin ? venvPath + '/bin/python' : venvPath + '\\Scripts\\python.exe');
      }
    }

    // Start AKTools
    const logPath = path.join(this.projectRoot, 'test-results/latest/logs/aktools.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    const proc = spawn(pythonCmd, ['-m', 'aktools'], {
      cwd: this.projectRoot,
      stdio: ['ignore', logStream, logStream],
      detached: true
    });

    this.processes.push({ name: 'AKTools', process: proc, port: 8080 });
    proc.unref();

    await this.waitForPort(8080, 'AKTools');
  }

  /**
   * Start mist application
   */
  async startMistApp() {
    logInfo('Starting mist application...');

    if (this.isPortInUse(8001)) {
      logWarning('mist is already running on port 8001');
      return;
    }

    const logPath = path.join(this.projectRoot, 'test-results/latest/logs/mist.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    const proc = spawn('pnpm', ['run', 'start:dev:mist'], {
      cwd: this.projectRoot,
      stdio: ['ignore', logStream, logStream],
      shell: true,
      detached: true
    });

    this.processes.push({ name: 'mist', process: proc, port: 8001 });
    proc.unref();

    await this.waitForPort(8001, 'mist');
  }

  /**
   * Start mcp-server
   */
  async startMCPServer() {
    logInfo('Starting mcp-server...');

    if (this.isPortInUse(8009)) {
      logWarning('mcp-server is already running on port 8009');
      return;
    }

    const logPath = path.join(this.projectRoot, 'test-results/latest/logs/mcp-server.log');
    fs.mkdirSync(path.dirname(logPath), { recursive: true });

    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    const proc = spawn('pnpm', ['run', 'start:dev:mcp-server'], {
      cwd: this.projectRoot,
      stdio: ['ignore', logStream, logStream],
      shell: true,
      detached: true
    });

    this.processes.push({ name: 'mcp-server', process: proc, port: 8009 });
    proc.unref();

    await this.waitForPort(8009, 'mcp-server');
  }

  /**
   * Stop all services
   */
  async stopAll() {
    logInfo('Stopping all services...');

    for (const svc of this.processes) {
      try {
        // Kill by port
        if (this.isPortInUse(svc.port)) {
          try {
            const pid = execSync(`lsof -ti :${svc.port}`, { stdio: 'pipe' }).toString().trim();
            if (pid) {
              execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
              logSuccess(`Stopped ${svc.name} (PID: ${pid})`);
            }
          } catch (error) {
            logWarning(`Failed to stop ${svc.name}:`, error.message);
          }
        }
      } catch (error) {
        logError(`Error stopping ${svc.name}:`, error.message);
      }
    }

    this.processes = [];
  }
}
```

**Step 2: 验证语法**

```bash
node -c test-integration/deep-test/lib/service-manager.mjs
```
预期: 无语法错误

**Step 3: Commit**

```bash
git add test-integration/deep-test/lib/service-manager.mjs
git commit -m "feat: implement service manager"
```

---

### Task 5: 实现API测试器 (api-tester.mjs)

**Files:**
- Modify: `test-integration/deep-test/lib/api-tester.mjs`

**Step 1: 编写API测试器**

```javascript
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
    const required = ['time', 'open', 'high', 'low', 'close', 'amount'];
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
```

**Step 2: 验证语法**

```bash
node -c test-integration/deep-test/lib/api-tester.mjs
```
预期: 无语法错误

**Step 3: Commit**

```bash
git add test-integration/deep-test/lib/api-tester.mjs
git commit -m "feat: implement API tester"
```

---

### Task 6: 实现数据验证器 (data-validator.mjs)

**Files:**
- Modify: `test-integration/deep-test/lib/data-validator.mjs`

**Step 1: 编写数据验证器**

```javascript
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
      const requiredFields = ['time', 'open', 'high', 'low', 'close'];
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
```

**Step 2: 验证语法**

```bash
node -c test-integration/deep-test/lib/data-validator.mjs
```
预期: 无语法错误

**Step 3: Commit**

```bash
git add test-integration/deep-test/lib/data-validator.mjs
git commit -m "feat: implement data validator"
```

---

### Task 7: 实现报告生成器 (report-generator.mjs)

**Files:**
- Modify: `test-integration/deep-test/lib/report-generator.mjs`

**Step 1: 编写报告生成器**

```javascript
#!/usr/bin/env node

/**
 * Report Generator - Generate test reports
 */

import fs from 'fs';
import path from 'path';
import { logInfo, logSuccess, saveJSON } from './utils.mjs';

export class ReportGenerator {
  constructor() {
    this.timestamp = new Date().toISOString().split('T')[0];
  }

  /**
   * Generate all reports
   */
  async generateReports(results, testDir) {
    logInfo('Generating test reports...');

    await this.generateSummary(results, testDir);
    await this.generateLayerReports(results, testDir);
    await this.generateHTMLReport(results, testDir);

    logSuccess('Reports generated');
  }

  /**
   * Generate summary report
   */
  async generateSummary(results, testDir) {
    const summary = {
      timestamp: new Date().toISOString(),
      testDuration: results.duration || 'N/A',
      overall: {
        total: 0,
        passed: 0,
        failed: 0,
        passRate: '0%'
      },
      layers: {}
    };

    // Calculate overall stats
    for (const [layerName, layerData] of Object.entries(results)) {
      if (layerData && typeof layerData === 'object' && 'total' in layerData) {
        summary.layers[layerName] = layerData;
        summary.overall.total += layerData.total || 0;
        summary.overall.passed += layerData.passed || 0;
        summary.overall.failed += layerData.failed || 0;
      }
    }

    if (summary.overall.total > 0) {
      summary.overall.passRate = ((summary.overall.passed / summary.overall.total) * 100).toFixed(2) + '%';
    }

    saveJSON(path.join(testDir, 'processed/summary.json'), summary);

    // Generate markdown summary
    const md = this.generateSummaryMarkdown(summary);
    fs.writeFileSync(path.join(testDir, 'reports/summary.md'), md, 'utf8');
  }

  generateSummaryMarkdown(summary) {
    return `# 测试总结

**时间**: ${summary.timestamp}
**测试时长**: ${summary.testDuration}

## 总体结果

| 指标 | 数值 |
|-----|-----|
| 总测试数 | ${summary.overall.total} |
| 通过 | ${summary.overall.passed} |
| 失败 | ${summary.overall.failed} |
| 通过率 | ${summary.overall.passRate} |

## 分层结果

${Object.entries(summary.layers).map(([name, data]) => `
### ${name}
- 总数: ${data.total}
- 通过: ${data.passed}
- 失败: ${data.failed}
- 通过率: ${data.passRate}
`).join('\n')}
`;
  }

  /**
   * Generate layer-specific reports
   */
  async generateLayerReports(results, testDir) {
    const reportsDir = path.join(testDir, 'reports');

    for (const [layerName, layerData] of Object.entries(results)) {
      if (!layerData || !layerData.results) continue;

      const md = this.generateLayerReport(layerName, layerData);
      const filename = path.join(reportsDir, `${layerName}-report.md`);
      fs.writeFileSync(filename, md, 'utf8');
    }
  }

  generateLayerReport(layerName, layerData) {
    const { results } = layerData;

    let md = `# ${layerName} 测试报告\n\n`;
    md += `## 概览\n\n`;
    md += `- 总测试数: ${layerData.total}\n`;
    md += `- 通过: ${layerData.passed}\n`;
    md += `- 失败: ${layerData.failed}\n`;
    md += `- 通过率: ${layerData.passRate}\n\n`;

    md += `## 测试结果详情\n\n`;

    for (const result of results) {
      md += `### ${result.name}\n\n`;
      md += `- **状态**: ${result.success ? '✅ 通过' : '❌ 失败'}\n`;
      md += `- **响应时间**: ${result.responseTime}ms\n\n`;

      if (result.validations && result.validations.length > 0) {
        md += `**验证结果**:\n\n`;
        for (const v of result.validations) {
          md += `- ${v.name}: ${v.passed ? '✅' : '❌'} ${v.details}\n`;
        }
        md += `\n`;
      }

      if (result.error) {
        md += `**错误**:\n`;
        md += `\`\`\`\n${JSON.stringify(result.error, null, 2)}\n\`\`\`\n\n`;
      }

      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        md += `**数据样本** (前3条):\n\n`;
        md += `\`\`\`json\n${JSON.stringify(result.data.slice(0, 3), null, 2)}\n\`\`\`\n\n`;
      }
    }

    return md;
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(results, testDir) {
    const html = this.generateHTML(results);
    const filepath = path.join(testDir, 'reports/final-report.html');
    fs.writeFileSync(filepath, html, 'utf8');
  }

  generateHTML(results) {
    const summary = this.calculateOverallSummary(results);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>后端深度测试报告</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }
        h2 { color: #666; margin-top: 30px; }
        .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin: 20px 0; }
        .metric-card { background: #f9f9f9; padding: 20px; border-radius: 6px; text-align: center; }
        .metric-value { font-size: 32px; font-weight: bold; color: #4CAF50; }
        .metric-label { color: #666; font-size: 14px; }
        .status-pass { color: #4CAF50; }
        .status-fail { color: #f44336; }
        .test-result { background: #f9f9f9; padding: 15px; margin: 10px 0; border-left: 4px solid #ddd; border-radius: 4px; }
        .test-result.passed { border-left-color: #4CAF50; }
        .test-result.failed { border-left-color: #f44336; }
        code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 14px; }
        pre { background: #2d2d2d; color: #f8f8f2; padding: 15px; border-radius: 6px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 后端深度测试报告</h1>
        <p><strong>时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>

        <h2>📊 总体结果</h2>
        <div class="summary">
            <div class="metric-card">
                <div class="metric-value">${summary.total}</div>
                <div class="metric-label">总测试数</div>
            </div>
            <div class="metric-card">
                <div class="metric-value status-pass">${summary.passed}</div>
                <div class="metric-label">通过</div>
            </div>
            <div class="metric-card">
                <div class="metric-value status-fail">${summary.failed}</div>
                <div class="metric-label">失败</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${summary.passRate}</div>
                <div class="metric-label">通过率</div>
            </div>
        </div>

        ${this.generateLayerSections(results)}
    </div>
</body>
</html>`;
  }

  calculateOverallSummary(results) {
    let total = 0, passed = 0, failed = 0;

    for (const layerData of Object.values(results)) {
      if (layerData && typeof layerData === 'object' && 'total' in layerData) {
        total += layerData.total || 0;
        passed += layerData.passed || 0;
        failed += layerData.failed || 0;
      }
    }

    const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) + '%' : '0%';

    return { total, passed, failed, passRate };
  }

  generateLayerSections(results) {
    let html = '';

    for (const [layerName, layerData] of Object.entries(results)) {
      if (!layerData || !layerData.results) continue;

      html += `<h2>${layerName}</h2>\n`;

      for (const result of layerData.results) {
        const statusClass = result.success ? 'passed' : 'failed';
        const statusText = result.success ? '✅ 通过' : '❌ 失败';

        html += `<div class="test-result ${statusClass}">
            <strong>${result.name}</strong> - ${statusText}
            <br><small>响应时间: ${result.responseTime}ms</small>`;

        if (result.validations && result.validations.length > 0) {
          html += `<div style="margin-top: 10px;">`;
          for (const v of result.validations) {
            html += `<div>${v.passed ? '✅' : '❌'} ${v.name}: ${v.details}</div>`;
          }
          html += `</div>`;
        }

        if (result.error) {
          html += `<div style="margin-top: 10px; color: #f44336;">
            <strong>错误:</strong> <code>${result.error.message}</code>
          </div>`;
        }

        html += `</div>\n`;
      }
    }

    return html;
  }
}
```

**Step 2: 验证语法**

```bash
node -c test-integration/deep-test/lib/report-generator.mjs
```
预期: 无语法错误

**Step 3: Commit**

```bash
git add test-integration/deep-test/lib/report-generator.mjs
git commit -m "feat: implement report generator"
```

---

## 第三阶段：主测试运行器

### Task 8: 实现主测试运行器 (runner.mjs)

**Files:**
- Modify: `test-integration/deep-test/runner.mjs`

**Step 1: 编写主测试运行器**

```javascript
#!/usr/bin/env node

/**
 * Deep Test Runner - Main test orchestrator
 */

import { ServiceManager } from './lib/service-manager.mjs';
import { APITester, validators } from './lib/api-tester.mjs';
import { DataValidator } from './lib/data-validator.mjs';
import { ReportGenerator } from './lib/report-generator.mjs';
import { formatDate, formatDateTime, logInfo, logSuccess, logError, createSymlink, createDirectories } from './lib/utils.mjs';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const projectRoot = path.resolve(__dirname, '../..');

// Test configuration
const TEST_CONFIG = {
  indices: [
    {
      symbol: 'sh000001',
      name: '上证指数',
      period: 'daily',
      startDate: '2024-01-01',
      endDate: '2024-12-31'
    },
    {
      symbol: 'sh000300',
      name: '沪深300',
      period: '30min',
      startDate: '2024-10-01',
      endDate: '2024-12-31'
    },
    {
      symbol: 'sh000905',
      name: '中证500',
      period: '60min',
      startDate: '2024-10-01',
      endDate: '2024-12-31'
    }
  ],
  tests: {
    dataLayer: true,
    indicatorLayer: true,
    chanLayer: true,
    mcpLayer: false  // MCP server needs separate testing
  }
};

class DeepTestRunner {
  constructor() {
    this.testDir = null;
    this.serviceManager = new ServiceManager();
    this.apiTester = new APITester('http://localhost:8001');
    this.dataValidator = new DataValidator();
    this.reportGenerator = new ReportGenerator();
    this.results = {};
    this.startTime = null;
  }

  async run() {
    try {
      this.startTime = Date.now();

      logInfo('🚀 Starting Deep Test Runner...\n');

      // Phase 1: Setup
      await this.phase1_Setup();

      // Phase 2: Start services
      await this.phase2_StartServices();

      // Phase 3: Data layer tests
      if (TEST_CONFIG.tests.dataLayer) {
        this.results.dataLayer = await this.phase3_TestDataLayer();
      }

      // Phase 4: Indicator layer tests
      if (TEST_CONFIG.tests.indicatorLayer) {
        this.results.indicatorLayer = await this.phase4_TestIndicatorLayer();
      }

      // Phase 5: Chan Theory layer tests
      if (TEST_CONFIG.tests.chanLayer) {
        this.results.chanLayer = await this.phase5_TestChanLayer();
      }

      // Phase 6: Generate reports
      await this.phase6_GenerateReports();

      // Phase 7: Cleanup
      await this.phase7_Cleanup();

      const duration = ((Date.now() - this.startTime) / 1000).toFixed(2);
      logSuccess(`\n✅ 测试完成！总耗时: ${duration}秒`);
      logSuccess(`📄 报告位置: ${path.join(this.testDir, 'reports/final-report.html')}`);

    } catch (error) {
      logError('\n❌ 测试失败:', error.message);
      await this.handleFailure(error);
      process.exit(1);
    }
  }

  async phase1_Setup() {
    logInfo('Phase 1: 环境准备\n');

    const timestamp = formatDate(new Date());
    this.testDir = path.join(projectRoot, 'test-results', `${timestamp}-backend-deep-test`);

    // Create directory structure
    const dirs = [
      path.join(this.testDir, 'config'),
      path.join(this.testDir, 'raw/data-layer'),
      path.join(this.testDir, 'raw/indicator-layer'),
      path.join(this.testDir, 'raw/chan-layer'),
      path.join(this.testDir, 'raw/mcp-layer'),
      path.join(this.testDir, 'processed'),
      path.join(this.testDir, 'logs'),
      path.join(this.testDir, 'reports'),
      path.join(this.testDir, 'coverage')
    ];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Save test config
    fs.writeFileSync(
      path.join(this.testDir, 'config/test-config.json'),
      JSON.stringify(TEST_CONFIG, null, 2),
      'utf8'
    );

    // Create symlink to latest
    const latestLink = path.join(projectRoot, 'test-results/latest');
    createSymlink(this.testDir, latestLink);

    logSuccess('环境准备完成\n');
  }

  async phase2_StartServices() {
    logInfo('Phase 2: 启动服务\n');

    await this.serviceManager.startAKTools();
    await this.serviceManager.startMistApp();

    logSuccess('所有服务启动完成\n');
  }

  async phase3_TestDataLayer() {
    logInfo('Phase 3: 数据层测试\n');

    const testCases = TEST_CONFIG.indices.map(idx => ({
      name: `${idx.name}-${idx.period}`,
      endpoint: '/indicator/k',
      body: {
        symbol: idx.symbol,
        code: idx.symbol,
        period: idx.period,
        startDate: idx.startDate,
        endDate: idx.endDate
      },
      validations: [
        { name: '数据存在', check: validators.hasData },
        { name: '字段完整', check: validators.hasRequiredFields },
        { name: '时间排序', check: validators.isTimeSorted }
      ]
    }));

    const results = await this.apiTester.runTests(testCases);

    // Save raw data
    for (let i = 0; i < results.results.length; i++) {
      const result = results.results[i];
      if (result.data) {
        const filename = `${TEST_CONFIG.indices[i].symbol}-${TEST_CONFIG.indices[i].period}.json`;
        fs.writeFileSync(
          path.join(this.testDir, 'raw/data-layer', filename),
          JSON.stringify(result.data, null, 2),
          'utf8'
        );
      }
    }

    logSuccess(`数据层测试完成: ${results.passed}/${results.total} 通过\n`);

    return results;
  }

  async phase4_TestIndicatorLayer() {
    logInfo('Phase 4: 指标层测试\n');

    const idx = TEST_CONFIG.indices[0];  // Use first index for indicator tests

    const testCases = [
      {
        name: 'MACD计算',
        endpoint: '/indicator/macd',
        body: {
          symbol: idx.symbol,
          code: idx.symbol,
          period: idx.period,
          startDate: idx.startDate,
          endDate: idx.endDate
        }
      },
      {
        name: 'KDJ计算',
        endpoint: '/indicator/kdj',
        body: {
          symbol: idx.symbol,
          code: idx.symbol,
          period: idx.period,
          startDate: idx.startDate,
          endDate: idx.endDate
        }
      },
      {
        name: 'RSI计算',
        endpoint: '/indicator/rsi',
        body: {
          symbol: idx.symbol,
          code: idx.symbol,
          period: idx.period,
          startDate: idx.startDate,
          endDate: idx.endDate
        }
      }
    ];

    const results = await this.apiTester.runTests(testCases);

    // Save raw data
    for (let i = 0; i < results.results.length; i++) {
      const result = results.results[i];
      if (result.data) {
        const filename = `${testCases[i].name.toLowerCase()}.json`;
        fs.writeFileSync(
          path.join(this.testDir, 'raw/indicator-layer', filename),
          JSON.stringify(result.data, null, 2),
          'utf8'
        );
      }
    }

    logSuccess(`指标层测试完成: ${results.passed}/${results.total} 通过\n`);

    return results;
  }

  async phase5_TestChanLayer() {
    logInfo('Phase 5: 缠论算法层测试\n');

    const idx = TEST_CONFIG.indices[0];
    const kDataPath = path.join(this.testDir, 'raw/data-layer', `${idx.symbol}-${idx.period}.json`);

    if (!fs.existsSync(kDataPath)) {
      logError('K线数据不存在，跳过缠论测试');
      return { total: 0, passed: 0, failed: 0, results: [] };
    }

    const kData = JSON.parse(fs.readFileSync(kDataPath, 'utf8'));

    const testCases = [
      {
        name: '合并K',
        endpoint: '/chan/merge-k',
        body: { k: kData }
      },
      {
        name: '笔识别',
        endpoint: '/chan/bi',
        body: { k: kData }
      },
      {
        name: '中枢识别',
        endpoint: '/chan/channel',
        body: { k: kData }
      }
    ];

    const results = await this.apiTester.runTests(testCases);

    // Save raw data
    for (let i = 0; i < results.results.length; i++) {
      const result = results.results[i];
      if (result.data) {
        const filename = `${testCases[i].name.toLowerCase()}.json`;
        fs.writeFileSync(
          path.join(this.testDir, 'raw/chan-layer', filename),
          JSON.stringify(result.data, null, 2),
          'utf8'
        );
      }
    }

    logSuccess(`缠论算法层测试完成: ${results.passed}/${results.total} 通过\n`);

    return results;
  }

  async phase6_GenerateReports() {
    logInfo('Phase 6: 生成报告\n');

    this.results.duration = ((Date.now() - this.startTime) / 1000).toFixed(2) + 's';

    await this.reportGenerator.generateReports(this.results, this.testDir);

    logSuccess('报告生成完成\n');
  }

  async phase7_Cleanup() {
    logInfo('Phase 7: 清理环境\n');

    await this.serviceManager.stopAll();

    logSuccess('清理完成\n');
  }

  async handleFailure(error) {
    // Save partial results
    if (this.testDir && Object.keys(this.results).length > 0) {
      const partialPath = path.join(this.testDir, 'partial-results.json');
      fs.writeFileSync(partialPath, JSON.stringify(this.results, null, 2), 'utf8');
      logError(`部分结果已保存: ${partialPath}`);
    }

    // Cleanup services
    await this.serviceManager.stopAll();
  }
}

// Run the tests
const runner = new DeepTestRunner();
runner.run();
```

**Step 2: 设置执行权限**

```bash
chmod +x test-integration/deep-test/runner.mjs
```

**Step 3: Commit**

```bash
git add test-integration/deep-test/runner.mjs
git commit -m "feat: implement main test runner"
```

---

## 第四阶段：配置和模板

### Task 9: 创建测试配置模板

**Files:**
- Modify: `test-integration/deep-test/templates/config-template.json`

**Step 1: 编写配置模板**

```json
{
  "$schema": "./config-schema.json",
  "testName": "后端深度测试",
  "description": "通过真实数据验证 mist、mcp-server 和缠论算法的所有功能",
  "version": "1.0.0",
  "indices": [
    {
      "symbol": "sh000001",
      "name": "上证指数",
      "period": "daily",
      "startDate": "2024-01-01",
      "endDate": "2024-12-31",
      "enabled": true
    },
    {
      "symbol": "sh000300",
      "name": "沪深300",
      "period": "30min",
      "startDate": "2024-10-01",
      "endDate": "2024-12-31",
      "enabled": true
    },
    {
      "symbol": "sh000905",
      "name": "中证500",
      "period": "60min",
      "startDate": "2024-10-01",
      "endDate": "2024-12-31",
      "enabled": true
    }
  ],
  "tests": {
    "dataLayer": {
      "enabled": true,
      "description": "测试数据获取和验证"
    },
    "indicatorLayer": {
      "enabled": true,
      "indicators": ["MACD", "KDJ", "RSI"],
      "description": "测试技术指标计算"
    },
    "chanLayer": {
      "enabled": true,
      "tests": ["merge-k", "bi", "channel"],
      "description": "测试缠论算法"
    },
    "mcpLayer": {
      "enabled": false,
      "description": "测试MCP工具（需要单独配置）"
    },
    "unitTests": {
      "enabled": true,
      "coverage": true,
      "description": "运行单元测试和生成覆盖率报告"
    }
  },
  "output": {
    "htmlReport": true,
    "markdownReport": true,
    "saveRawData": true,
    "createArchive": false,
    "reportsDir": "test-results"
  },
  "services": {
    "mist": {
      "port": 8001,
      "startupTimeout": 30000,
      "healthCheck": {
        "endpoint": "/app/hello",
        "interval": 500,
        "timeout": 30000
      }
    },
    "mcpServer": {
      "port": 8009,
      "startupTimeout": 30000
    },
    "aktools": {
      "port": 8080,
      "startupTimeout": 30000
    }
  },
  "validation": {
    "minDataRecords": 1,
    "requireSortedData": true,
    "strictValidation": false
  }
}
```

**Step 2: Commit**

```bash
git add test-integration/deep-test/templates/config-template.json
git commit -m "feat: add test configuration template"
```

---

### Task 10: 创建HTML报告模板

**Files:**
- Modify: `test-integration/deep-test/templates/report-template.html`

**Step 1: 编写HTML模板**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>后端深度测试报告 - {{timestamp}}</title>
    <style>
        :root {
            --primary: #4CAF50;
            --danger: #f44336;
            --warning: #ff9800;
            --info: #2196F3;
            --dark: #333;
            --light: #f5f5f5;
            --border: #e0e0e0;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: var(--light);
            color: var(--dark);
            line-height: 1.6;
            padding: 20px;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            overflow: hidden;
        }

        header {
            background: linear-gradient(135deg, var(--primary) 0%, #45a049 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }

        header h1 { font-size: 2.5em; margin-bottom: 10px; }
        header .meta { opacity: 0.9; font-size: 0.95em; }

        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            padding: 30px;
            background: #fafafa;
        }

        .metric-card {
            background: white;
            padding: 25px;
            border-radius: 10px;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            transition: transform 0.2s;
        }

        .metric-card:hover { transform: translateY(-3px); }

        .metric-value {
            font-size: 2.5em;
            font-weight: bold;
            margin-bottom: 5px;
        }

        .metric-value.success { color: var(--primary); }
        .metric-value.danger { color: var(--danger); }
        .metric-value.info { color: var(--info); }

        .metric-label {
            color: #666;
            font-size: 0.9em;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .section {
            padding: 30px;
            border-bottom: 1px solid var(--border);
        }

        .section:last-child { border-bottom: none; }

        .section h2 {
            color: var(--dark);
            margin-bottom: 20px;
            font-size: 1.5em;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .test-result {
            background: #fafafa;
            padding: 20px;
            margin: 15px 0;
            border-radius: 8px;
            border-left: 4px solid var(--border);
            transition: all 0.2s;
        }

        .test-result:hover {
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }

        .test-result.passed { border-left-color: var(--primary); }
        .test-result.failed { border-left-color: var(--danger); }

        .test-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .test-name { font-weight: 600; font-size: 1.05em; }
        .test-status { padding: 4px 12px; border-radius: 20px; font-size: 0.85em; font-weight: 600; }
        .test-status.passed { background: #e8f5e9; color: var(--primary); }
        .test-status.failed { background: #ffebee; color: var(--danger); }

        .test-meta {
            color: #666;
            font-size: 0.9em;
            margin-bottom: 10px;
        }

        .validation-list {
            margin-top: 12px;
            padding-top: 12px;
            border-top: 1px dashed var(--border);
        }

        .validation-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 0;
            font-size: 0.9em;
        }

        .validation-item.passed { color: var(--primary); }
        .validation-item.failed { color: var(--danger); }

        code {
            background: #f4f4f4;
            padding: 2px 8px;
            border-radius: 4px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 0.9em;
        }

        pre {
            background: #2d2d2d;
            color: #f8f8f2;
            padding: 15px;
            border-radius: 8px;
            overflow-x: auto;
            margin: 10px 0;
            font-size: 0.9em;
        }

        .error-box {
            background: #ffebee;
            color: #c62828;
            padding: 15px;
            border-radius: 8px;
            margin-top: 10px;
        }

        .progress-bar {
            height: 8px;
            background: #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 20px;
        }

        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--primary) 0%, #45a049 100%);
            transition: width 0.3s ease;
        }

        footer {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 0.9em;
            background: #fafafa;
        }

        @media (max-width: 768px) {
            .summary-grid { grid-template-columns: 1fr 1fr; }
            header h1 { font-size: 1.8em; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🧪 后端深度测试报告</h1>
            <div class="meta">
                <span>生成时间: {{timestamp}}</span> |
                <span>测试时长: {{duration}}</span>
            </div>
        </header>

        <div class="summary-grid">
            <div class="metric-card">
                <div class="metric-value info">{{totalTests}}</div>
                <div class="metric-label">总测试数</div>
            </div>
            <div class="metric-card">
                <div class="metric-value success">{{passedTests}}</div>
                <div class="metric-label">通过</div>
            </div>
            <div class="metric-card">
                <div class="metric-value danger">{{failedTests}}</div>
                <div class="metric-label">失败</div>
            </div>
            <div class="metric-card">
                <div class="metric-value success">{{passRate}}</div>
                <div class="metric-label">通过率</div>
            </div>
        </div>

        <div class="progress-bar">
            <div class="progress-fill" style="width: {{passRate}}"></div>
        </div>

        {{content}}

        <footer>
            <p>Mist 后端深度测试系统 | 自动生成</p>
        </footer>
    </div>
</body>
</html>
```

**Step 2: Commit**

```bash
git add test-integration/deep-test/templates/report-template.html
git commit -m "feat: add HTML report template"
```

---

## 第五阶段：NPM配置和文档

### Task 11: 更新 package.json

**Files:**
- Modify: `package.json`

**Step 1: 添加测试脚本**

在 `package.json` 的 `scripts` 部分添加：

```json
{
  "scripts": {
    "test:deep": "node test-integration/deep-test/runner.mjs",
    "test:deep:watch": "nodemon --watch test-integration --exec 'node test-integration/deep-test/runner.mjs'"
  }
}
```

完整添加位置：找到 `"test:full": "pnpm run test && pnpm run test:sync"` 这一行，在其后添加逗号和上面的新脚本。

**Step 2: 验证配置**

```bash
cat package.json | grep -A 2 "test:deep"
```
预期: 看到新添加的脚本

**Step 3: Commit**

```bash
git add package.json
git commit -m "feat: add deep test npm scripts"
```

---

### Task 12: 创建使用文档

**Files:**
- Create: `test-integration/deep-test/README.md`

**Step 1: 编写使用文档**

```markdown
# 后端深度测试工具

## 简介

渐进式集成测试工具，通过真实市场数据验证 Mist 后端服务的所有功能。

## 测试范围

- **数据层**: K线数据获取、数据完整性验证
- **指标层**: MACD、KDJ、RSI 技术指标计算
- **算法层**: 缠论算法（合并K、笔识别、中枢识别）
- **MCP层**: MCP 工具接口（可选）

## 前置要求

1. MySQL 服务运行中
2. Python 3.8+ 已安装
3. AKTools 已安装（`python3 -m pip install aktools`）
4. Node.js 18+ 和 pnpm

## 使用方法

### 快速开始

```bash
# 运行完整测试
pnpm run test:deep

# 监听模式（开发时使用）
pnpm run test:deep:watch
```

### 测试配置

编辑 `test-integration/deep-test/runner.mjs` 中的 `TEST_CONFIG` 变量来自定义测试参数：

```javascript
const TEST_CONFIG = {
  indices: [
    {
      symbol: 'sh000001',      // 指数代码
      name: '上证指数',
      period: 'daily',         // 数据周期
      startDate: '2024-01-01',
      endDate: '2024-12-31'
    }
  ],
  tests: {
    dataLayer: true,
    indicatorLayer: true,
    chanLayer: true,
    mcpLayer: false
  }
};
```

### 查看报告

测试完成后，报告会保存在 `test-results/<date>-backend-deep-test/reports/final-report.html`

最新测试结果快捷方式：`test-results/latest/reports/final-report.html`

## 测试流程

```
环境检查 → 服务启动 → 数据层测试 → 指标层测试 → 算法层测试 → 生成报告 → 清理
```

## 故障排除

### AKTools 启动失败

确保 Python 虚拟环境已激活并安装了 AKTools：

```bash
python3 -m venv python-env
source python-env/bin/activate  # Windows: python-env\Scripts\activate
python3 -m pip install aktools
```

### 端口被占用

如果 8001、8009 或 8080 端口被占用，测试会自动检测并提示。请先停止占用这些端口的进程。

### MySQL 连接失败

确保 MySQL 服务正在运行：

```bash
# macOS
brew services start mysql

# Linux
sudo systemctl start mysql
```

## 目录结构

```
test-integration/deep-test/
├── runner.mjs              # 主测试运行器
├── lib/
│   ├── service-manager.mjs # 服务管理
│   ├── api-tester.mjs      # API测试
│   ├── data-validator.mjs  # 数据验证
│   ├── report-generator.mjs # 报告生成
│   └── utils.mjs           # 工具函数
└── templates/
    ├── config-template.json
    └── report-template.html
```
```

**Step 2: Commit**

```bash
git add test-integration/deep-test/README.md
git commit -m "docs: add deep test usage documentation"
```

---

## 第六阶段：测试验证

### Task 13: 验证工具链

**Step 1: 语法检查所有文件**

```bash
node -c test-integration/deep-test/runner.mjs
node -c test-integration/deep-test/lib/*.mjs
```
预期: 无语法错误

**Step 2: 检查目录结构**

```bash
tree test-integration/deep-test -L 2
```
预期: 看到完整的目录结构

**Step 3: 验证脚本可执行**

```bash
ls -l test-integration/deep-test/runner.mjs
```
预期: 有执行权限（-rwxr-xr-x）

---

### Task 14: 创建最终验证清单

**Files:**
- Create: `test-integration/deep-test/VERIFICATION.md`

**Step 1: 编写验证清单**

```markdown
# 实施验证清单

## 目录结构验证

- [ ] `test-integration/deep-test/` 目录存在
- [ ] `lib/` 子目录包含所有工具库文件
- [ ] `templates/` 子目录包含配置和报告模板
- [ ] `scripts/` 目录已删除

## 文件完整性验证

- [ ] `runner.mjs` - 主测试运行器
- [ ] `lib/utils.mjs` - 工具函数
- [ ] `lib/service-manager.mjs` - 服务管理器
- [ ] `lib/api-tester.mjs` - API测试器
- [ ] `lib/data-validator.mjs` - 数据验证器
- [ ] `lib/report-generator.mjs` - 报告生成器
- [ ] `templates/config-template.json` - 配置模板
- [ ] `templates/report-template.html` - HTML报告模板
- [ ] `README.md` - 使用文档

## NPM 配置验证

- [ ] `package.json` 包含 `test:deep` 脚本
- [ ] `package.json` 包含 `test:deep:watch` 脚本

## 功能验证

### 环境检查
- [ ] Node.js 版本正确
- [ ] 项目依赖已安装
- [ ] MySQL 服务运行中

### 服务启动
- [ ] AKTools 可以启动
- [ ] mist 应用可以启动
- [ ] 端口检测正常工作

### 测试执行
- [ ] 数据层测试可以运行
- [ ] 指标层测试可以运行
- [ ] 缠论算法层测试可以运行
- [ ] 测试结果正确保存

### 报告生成
- [ ] JSON 配置文件生成
- [ ] Markdown 报告生成
- [ ] HTML 报告生成
- [ ] 快捷链接创建

### 清理
- [ ] 服务可以正常停止
- [ ] 进程正确清理

## 文档验证

- [ ] 设计文档存在 (`docs/plans/2025-03-15-backend-deep-test-design.md`)
- [ ] 实施计划存在 (`docs/plans/2025-03-15-backend-deep-test.md`)
- [ ] 使用文档存在 (`test-integration/deep-test/README.md`)

## 代码质量

- [ ] 所有文件无语法错误
- [ ] 代码符合项目规范
- [ ] 提交信息清晰
- [ ] 无遗留调试代码

## 完整测试运行

- [ ] 执行 `pnpm run test:deep` 成功
- [ ] 测试报告可以查看
- [ ] 通过率符合预期
```

**Step 2: Commit**

```bash
git add test-integration/deep-test/VERIFICATION.md
git commit -m "docs: add verification checklist"
```

---

## 完成检查

### Task 15: 最终检查和提交

**Step 1: 检查所有更改**

```bash
git status
```
预期: 看到所有新增和修改的文件

**Step 2: 查看提交历史**

```bash
git log --oneline -10
```
预期: 看到清晰的提交历史

**Step 3: 创建最终提交**

```bash
git add -A
git commit -m "feat: complete backend deep testing tool implementation

- Created test-integration/deep-test/ directory structure
- Implemented service manager for AKTools, mist, and mcp-server
- Implemented API tester with validators
- Implemented data validator for all data types
- Implemented report generator (HTML/Markdown/JSON)
- Added main test runner with phased execution
- Removed obsolete scripts/ directory
- Added npm scripts: test:deep, test:deep:watch
- Created comprehensive documentation
- Added verification checklist

Related: #backend-deep-test"
```

---

## 使用说明

完成实施后，可以运行测试：

```bash
# 运行完整深度测试
pnpm run test:deep

# 查看最新测试报告
open test-results/latest/reports/final-report.html
```

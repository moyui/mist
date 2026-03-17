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

// Test configuration - 使用实际采集的数据范围 (2024-09-22 到 2026-03-15)
const TEST_CONFIG = {
  indices: [
    {
      symbol: '000001',
      name: '上证指数',
      period: 'daily',
      startDate: '2024-10-01',
      endDate: '2024-12-31'
    },
    {
      symbol: '000001',
      name: '上证指数-2025',
      period: 'daily',
      startDate: '2025-01-01',
      endDate: '2025-03-15'
    },
    {
      symbol: '000300',
      name: '沪深300',
      period: 'daily',
      startDate: '2024-10-01',
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
        code: 'sh',
        daily: true,
        startDate: new Date(idx.startDate).getTime(),
        endDate: new Date(idx.endDate).getTime()
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
          code: 'sh',
          daily: true,
          startDate: new Date(idx.startDate).getTime(),
          endDate: new Date(idx.endDate).getTime()
        }
      },
      {
        name: 'KDJ计算',
        endpoint: '/indicator/kdj',
        body: {
          symbol: idx.symbol,
          code: 'sh',
          daily: true,
          startDate: new Date(idx.startDate).getTime(),
          endDate: new Date(idx.endDate).getTime()
        }
      },
      {
        name: 'RSI计算',
        endpoint: '/indicator/rsi',
        body: {
          symbol: idx.symbol,
          code: 'sh',
          daily: true,
          startDate: new Date(idx.startDate).getTime(),
          endDate: new Date(idx.endDate).getTime()
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

    // Step 1: Test merge-k and bi (both use K data, can run in parallel)
    const step1Tests = [
      {
        name: '合并K',
        endpoint: '/chan/merge-k',
        body: { k: kData }
      },
      {
        name: '笔识别',
        endpoint: '/chan/bi',
        body: { k: kData }
      }
    ];

    const step1Results = await this.apiTester.runTests(step1Tests);

    // Step 2: Test channel (uses bi data from step 1)
    const biResult = step1Results.results.find(r => r.name === '笔识别');
    let step2Results = { total: 0, passed: 0, failed: 0, results: [] };

    if (biResult?.data) {
      const step2Tests = [
        {
          name: '中枢识别',
          endpoint: '/chan/channel',
          body: { bi: biResult.data }
        }
      ];

      step2Results = await this.apiTester.runTests(step2Tests);
    } else {
      logError('笔识别失败，跳过中枢识别测试\n');
    }

    // Combine results
    const allResults = {
      total: step1Results.total + step2Results.total,
      passed: step1Results.passed + step2Results.passed,
      failed: step1Results.failed + step2Results.failed,
      results: [...step1Results.results, ...step2Results.results]
    };

    // Save raw data
    for (let i = 0; i < allResults.results.length; i++) {
      const result = allResults.results[i];
      if (result.data) {
        const filename = `${result.name.toLowerCase()}.json`;
        fs.writeFileSync(
          path.join(this.testDir, 'raw/chan-layer', filename),
          JSON.stringify(result.data, null, 2),
          'utf8'
        );
      }
    }

    logSuccess(`缠论算法层测试完成: ${allResults.passed}/${allResults.total} 通过\n`);

    return allResults;
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

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

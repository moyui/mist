#!/usr/bin/env ts-node
/**
 * Fetch Shanghai Index Data from AkTools API
 *
 * This script fetches daily data for Shanghai Composite Index (000001.SH)
 * from the aktools API and generates a fixture file for testing.
 *
 * Requirements:
 * - aktools must be running on http://127.0.0.1:8080
 * - Start aktools: python3 -m aktools
 *
 * Usage:
 *   ts-node fetch-shanghai-index-data.ts
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// API Configuration
const AKTOOLS_BASE_URL = 'http://127.0.0.1:8080';
const API_ENDPOINT = '/api/public/stock_zh_index_daily_em';

// Data parameters
const SYMBOL = 'sh000001';
const START_DATE = '20240101';
const END_DATE = '20251231';

// Output file path
const OUTPUT_DIR = path.join(__dirname, '..', 'fixtures');
const OUTPUT_FILE = path.join(
  OUTPUT_DIR,
  'shanghai-index-2024-2025.fixture.ts',
);

/**
 * AkTools API response interface
 */
interface AkToolsKLine {
  日期: string; // Date in YYYY-MM-DD format
  开盘: number; // Open
  收盘: number; // Close
  最高: number; // Highest
  最低: number; // Lowest
  成交量: number; // Volume
  成交额: number; // Amount
  振幅: number; // Amplitude
  涨跌幅: number; // Change percent
  涨跌额: number; // Change amount
  换手率: number; // Turnover rate
}

/**
 * KVo format for our fixture
 */
interface KVo {
  id: number;
  symbol: string;
  time: Date;
  amount: number;
  open: number;
  close: number;
  highest: number;
  lowest: number;
}

/**
 * Fetch data from AkTools API
 */
async function fetchShanghaiIndexData(): Promise<AkToolsKLine[]> {
  try {
    const url = `${AKTOOLS_BASE_URL}${API_ENDPOINT}`;
    const params = {
      symbol: SYMBOL,
      start_date: START_DATE,
      end_date: END_DATE,
    };

    console.log(`Fetching data from AkTools API...`);
    console.log(`  URL: ${url}`);
    console.log(`  Symbol: ${SYMBOL}`);
    console.log(`  Date Range: ${START_DATE} - ${END_DATE}`);

    const response = await axios.get<AkToolsKLine[]>(url, { params });
    const data = response.data;

    console.log(`✓ Fetched ${data.length} records`);
    return data;
  } catch (error: any) {
    if (error.code === 'ECONNREFUSED') {
      console.error(
        `\n❌ Error: Cannot connect to AkTools API at ${AKTOOLS_BASE_URL}`,
      );
      console.error(`\nPlease make sure aktools is running:`);
      console.error(
        `  1. Activate Python venv: source python-env/bin/activate`,
      );
      console.error(`  2. Start aktools: python3 -m aktools`);
      console.error(`\nAkTools should be running on port 8080\n`);
    } else {
      console.error(`\n❌ Error fetching data:`, error.message);
    }
    throw error;
  }
}

/**
 * Transform AkTools data to KVo format
 */
function transformToKVo(data: AkToolsKLine[]): KVo[] {
  return data.map((item, index) => ({
    id: index + 1,
    symbol: '000001',
    time: new Date(item['日期']),
    amount: item['成交额'] || 0,
    open: item['开盘'],
    close: item['收盘'],
    highest: item['最高'],
    lowest: item['最低'],
  }));
}

/**
 * Generate fixture file content
 */
function generateFixtureContent(kData: KVo[]): string {
  const header = `import { KVo } from '../../../indicator/vo/k.vo';

/**
 * Shanghai Index 2024-2025 Data Fixture
 *
 * Data source: AkTools (http://127.0.0.1:8080)
 * API: stock_zh_index_daily_em
 * Symbol: sh000001 (上证指数 - Shanghai Composite Index)
 *
 * Date range: 2024-01-01 to 2025-12-31
 * Total records: ${kData.length}
 *
 * This fixture contains daily K-line data for the Shanghai Composite Index
 * spanning two full years of trading data.
 */
export const shanghaiIndexData2024_2025: KVo[] = [
`;

  const dataEntries = kData.map((k) => {
    const dateStr = k.time.toISOString().split('T')[0];
    return `  {
    id: ${k.id},
    symbol: '${k.symbol}',
    time: new Date('${dateStr}'),
    amount: ${k.amount},
    open: ${k.open},
    close: ${k.close},
    highest: ${k.highest},
    lowest: ${k.lowest},
  }`;
  });

  const footer = `
];

/**
 * Data Statistics
 */
export const shanghaiIndexStats = {
  totalRecords: ${kData.length},
  dateRange: {
    start: '${kData[0].time.toISOString().split('T')[0]}',
    end: '${kData[kData.length - 1].time.toISOString().split('T')[0]}',
  },
  priceRange: {
    highest: ${Math.max(...kData.map((k) => k.highest))},
    lowest: ${Math.min(...kData.map((k) => k.lowest))},
  },
};
`;

  return header + dataEntries.join(',\n') + footer;
}

/**
 * Main execution function
 */
async function main() {
  console.log('\n========================================');
  console.log('Shanghai Index Data Fetcher');
  console.log('========================================\n');

  try {
    // Fetch data from API
    const rawData = await fetchShanghaiIndexData();

    // Transform to KVo format
    console.log(`\nTransforming data to KVo format...`);
    const kData = transformToKVo(rawData);
    console.log(`✓ Transformed ${kData.length} records`);

    // Print statistics
    const highest = Math.max(...kData.map((k) => k.highest));
    const lowest = Math.min(...kData.map((k) => k.lowest));
    const startDate = kData[0].time.toISOString().split('T')[0];
    const endDate = kData[kData.length - 1].time.toISOString().split('T')[0];

    console.log(`\nData Statistics:`);
    console.log(`  Date Range: ${startDate} to ${endDate}`);
    console.log(`  Price Range: ${lowest} - ${highest}`);
    console.log(`  Total Trading Days: ${kData.length}`);

    // Generate fixture file content
    console.log(`\nGenerating fixture file...`);
    const content = generateFixtureContent(kData);

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // Write to file
    fs.writeFileSync(OUTPUT_FILE, content, 'utf-8');
    console.log(`✓ Fixture file created: ${OUTPUT_FILE}`);

    const fileSize = Buffer.byteLength(content, 'utf8');
    console.log(`  File size: ${(fileSize / 1024).toFixed(2)} KB`);

    console.log(`\n✓ Success! You can now run tests with this fixture data.\n`);
  } catch (error) {
    console.error(
      `\n❌ Script failed. Please fix the errors and try again.\n`,
      error,
    );
    process.exit(1);
  }
}

// Run the script
main();

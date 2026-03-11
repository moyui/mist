#!/usr/bin/env node

/**
 * Generate TypeScript type definitions from JSON test results
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RESULTS_DIR = path.resolve(__dirname, '../test-data/test-results/raw');
const TYPES_DIR = path.resolve(__dirname, '../test-data/test-results/types');

// Ensure directory exists
if (!fs.existsSync(TYPES_DIR)) {
  fs.mkdirSync(TYPES_DIR, { recursive: true });
}

function toPascalCase(str) {
  return str
    .split(/[-]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function generateTypeDefinition(jsonFile) {
  const basename = path.basename(jsonFile, '.json');
  const tsPath = path.join(TYPES_DIR, `${basename}.ts`);
  const exportName = toPascalCase(basename);
  const varName = exportName.toLowerCase();
  const timestamp = new Date().toISOString();

  const content = `/**
 * ${exportName} Type Definitions
 *
 * Auto-generated from ${jsonFile}
 * Generated at: ${timestamp}
 */

// Import JSON data
import rawData from '../../results/json/${jsonFile}';

// Type definitions matching backend VO structures
export interface I${exportName}K {
  id: number;
  symbol: string;
  time: Date | string;
  amount: number;
  open: number;
  close: number;
  highest: number;
  lowest: number;
}

export interface I${exportName}MergeK {
  startTime: Date | string;
  endTime: Date | string;
  highest: number;
  lowest: number;
  trend: string;
  mergedCount: number;
  mergedIds: number[];
  mergedData: I${exportName}K[];
}

export interface I${exportName}Bi {
  startTime: Date | string;
  endTime: Date | string;
  highest: number;
  lowest: number;
  trend: string;
  type: string;
  status: number;
  independentCount: number;
  originIds: number[];
  originData: I${exportName}K[];
}

export interface I${exportName}Channel {
  zg: number;
  zd: number;
  gg: number;
  dd: number;
  level: string;
  type: string;
  startId: number;
  endId: number;
  trend: string;
  bis: any[];
}

// Main data interface
export interface I${exportName}Data {
  metadata: any;
  summary: any;
  data: {
    originalKLines: I${exportName}K[];
    mergeK: I${exportName}MergeK[];
    bis: I${exportName}Bi[];
    channels: I${exportName}Channel[];
  };
}

// Type assertion
export const ${varName}: I${exportName}Data = rawData as unknown as I${exportName}Data;

// Convenience exports with export name for frontend
export const ${varName}KLines = ${varName}.data.originalKLines;
export const ${varName}MergeK = ${varName}.data.mergeK;
export const ${varName}Bi = ${varName}.data.bis;
export const ${varName}Channels = ${varName}.data.channels;
export const ${varName}Summary = ${varName}.summary;
`;

  fs.writeFileSync(tsPath, content);
  console.log(`✅ Generated: ${basename}.ts`);
}

function main() {
  console.log('🔍 Scanning test results...\n');

  if (!fs.existsSync(RESULTS_DIR)) {
    console.log('⚠️  Test results directory not found');
    return;
  }

  const jsonFiles = fs
    .readdirSync(RESULTS_DIR)
    .filter((f) => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.log('⚠️  No JSON files found');
    return;
  }

  console.log(`📝 Found ${jsonFiles.length} test result files\n`);

  jsonFiles.forEach(generateTypeDefinition);

  console.log(`\n✅ Complete! Types generated to: ${TYPES_DIR}`);
}

main();

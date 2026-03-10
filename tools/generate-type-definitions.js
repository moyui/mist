#!/usr/bin/env node

/**
 * Generate TypeScript type definitions from JSON test results
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.resolve(__dirname, '../test-data/test-results/raw');
const TYPES_DIR = path.resolve(__dirname, '../test-data/test-results/types');

// Ensure directory exists
if (!fs.existsSync(TYPES_DIR)) {
  fs.mkdirSync(TYPES_DIR, { recursive: true });
}

function toPascalCase(str) {
  return str.split(/[-]/g).map(part =>
    part.charAt(0).toUpperCase() + part.slice(1)
  ).join('');
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

// Type definitions matching backend VO structures
export interface IFetchK {
  id: number;
  symbol: string;
  time: Date | string;
  amount: number;
  open: number;
  close: number;
  highest: number;
  lowest: number;
}

export interface IMergeK {
  startTime: Date | string;
  endTime: Date | string;
  highest: number;
  lowest: number;
  trend: string;
  mergedCount: number;
  mergedIds: number[];
  mergedData: IFetchK[];
}

export interface IFetchBi {
  startTime: Date | string;
  endTime: Date | string;
  highest: number;
  lowest: number;
  trend: string;
  type: string;
  status: number;
  independentCount: number;
  originIds: number[];
  originData: IFetchK[];
}

export interface IFetchChannel {
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
    originalKLines: IFetchK[];
    mergeK: IMergeK[];
    bis: IFetchBi[];
    channels: IFetchChannel[];
  };
}

// Import JSON data
import rawData from './${jsonFile}';

// Type assertion
export const ${varName}: I${exportName}Data = rawData as unknown as I${exportName}Data;

// Convenience exports
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

  const jsonFiles = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.log('⚠️  No JSON files found');
    return;
  }

  console.log(`📝 Found ${jsonFiles.length} test result files\n`);

  jsonFiles.forEach(generateTypeDefinition);

  console.log(`\n✅ Complete! Types generated to: ${TYPES_DIR}`);
}

main();

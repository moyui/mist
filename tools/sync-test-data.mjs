#!/usr/bin/env node

/**
 * Sync test data to frontend repository
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG = {
  frontendPath: path.resolve(__dirname, '../../mist-fe'),
  testResultsDir: path.resolve(__dirname, '../test-data/test-results/raw'),
  requiredFiles: [
    'shanghai-index-2024-2025-results.json',
    'csi300-2025-results.json',
    'shanghai-index-2024-results.json',
  ],
};

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

function checkFrontendExists() {
  log(colors.blue, '🔍 Checking frontend repository...');

  if (!fs.existsSync(CONFIG.frontendPath)) {
    log(colors.red, '❌ Frontend repository not found:', CONFIG.frontendPath);
    process.exit(1);
  }

  log(colors.green, '✅ Frontend repository found');
}

function validateTestResults() {
  log(colors.blue, '🔍 Validating test results...');

  const missingFiles = CONFIG.requiredFiles.filter((file) => {
    const filePath = path.join(CONFIG.testResultsDir, file);
    return !fs.existsSync(filePath);
  });

  if (missingFiles.length > 0) {
    log(colors.yellow, '⚠️  Missing test result files:', missingFiles);
    log(colors.yellow, '💡 Hint: Run pnpm run test first');
    return false;
  }

  log(colors.green, '✅ Test results validated');
  return true;
}

function syncToFrontend() {
  log(colors.blue, '🚀 Syncing to frontend...');

  try {
    const cmd = `pnpm --dir ${CONFIG.frontendPath} run sync:from-backend`;
    execSync(cmd, {
      stdio: 'inherit',
      env: {
        ...process.env,
        BACKEND_PATH: path.resolve(__dirname, '..'),
      },
    });
    log(colors.green, '✅ Sync completed');
  } catch (error) {
    log(colors.red, '❌ Sync failed:', error.message);
    process.exit(1);
  }
}

function main() {
  log(colors.blue, '🎯 Syncing test data to frontend...\n');

  try {
    checkFrontendExists();
    validateTestResults();
    syncToFrontend();

    log(colors.green, '\n🎉 Sync complete!');
    log(colors.blue, '💡 In frontend: pnpm run dev');
  } catch (error) {
    log(colors.red, '\n❌ Sync failed:', error.message);
    process.exit(1);
  }
}

// Check if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

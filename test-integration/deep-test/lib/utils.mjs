#!/usr/bin/env node

/**
 * Utility functions for deep testing
 */

import fs from 'fs';
import path from 'path';

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

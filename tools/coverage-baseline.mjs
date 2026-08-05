#!/usr/bin/env node
/**
 * Ratchet baseline tool for the mist (Jest) coverage threshold.
 *
 * Reads `coverage/coverage-summary.json` produced by `jest --coverage`,
 * computes the overall line percentage, and writes back
 * `package.json > jest.coverageThreshold.global.lines` with the LARGER of the
 * old committed value and the measured value — so the floor only ever rises.
 *
 * Run locally (never in CI):
 *   1. pnpm run test:coverage
 *   2. node tools/coverage-baseline.mjs
 *   3. review the diff, then commit package.json
 *
 * CI only READS the committed threshold to enforce the gate; it never mutates
 * the repository.
 *
 * Usage:
 *   node tools/coverage-baseline.mjs          # write back (default)
 *   node tools/coverage-baseline.mjs --check  # exit non-zero if measured < committed
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = resolve(root, 'package.json');
const summaryPath = resolve(root, 'coverage', 'coverage-summary.json');

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const checkOnly = process.argv.includes('--check');

const summary = readJson(summaryPath);
const total = summary.total;
if (!total || typeof total.lines.pct !== 'number') {
  console.error(
    `No overall lines.pct found in ${summaryPath}. Run 'pnpm run test:coverage' first.`,
  );
  process.exit(1);
}

const measured = round2(total.lines.pct);
const pkg = readJson(pkgPath);
const committed = pkg.jest?.coverageThreshold?.global?.lines;

if (typeof committed !== 'number') {
  console.error(
    'No jest.coverageThreshold.global.lines found in package.json.',
  );
  process.exit(1);
}

const direction =
  measured > committed ? 'RISE' : measured < committed ? 'DROP' : 'same';

if (checkOnly) {
  if (measured < committed) {
    console.error(
      `Coverage regression: measured ${measured}% < committed ${committed}%.`,
    );
    process.exit(2);
  }
  console.log(`OK: measured ${measured}% >= committed ${committed}%.`);
  process.exit(0);
}

if (direction === 'RISE') {
  pkg.jest.coverageThreshold.global.lines = measured;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(
    `Ratchet raised: ${committed}% -> ${measured}% (written to package.json).`,
  );
} else if (direction === 'DROP') {
  console.log(
    `Measured ${measured}% < committed ${committed}%. NOT lowering the baseline (ratchet only rises).`,
  );
  console.log('If this drop is intentional, edit package.json manually.');
} else {
  console.log(`No change: ${measured}% == ${committed}%.`);
}

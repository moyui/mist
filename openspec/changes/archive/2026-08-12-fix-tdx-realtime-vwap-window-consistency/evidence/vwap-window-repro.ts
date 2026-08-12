/**
 * V2 reproduction — TDX realtime vwap window consistency (evidence script).
 *
 * Drives the REAL `OpenCandleAggregator` + `convertTdxNativeSnapshot` through
 * a synthetic 3s-cadence TDX frame stream (bridge wall-clock capturedAt,
 * second precision) and runs the production vwap check semantics
 * (vwap = a/v must lie within sealed [low, high]).
 *
 * Scenarios:
 *   A.  exact quantities, no corruption           -> check-premise failure (M1/M3)
 *   B.  A + ~2% frames missing Volume or Amount   -> per-field window divergence (M2)
 *   C.  A + provider-style integer-手 Volume      -> lot-rounding granularity (M4)
 *
 * Run (from mist repo root):
 *   node -r tsconfig-paths/register -r ts-node/register \
 *     openspec/changes/fix-tdx-realtime-vwap-window-consistency/evidence/vwap-window-repro.ts
 */
import { OpenCandleAggregator } from '../../../../apps/mist/src/realtime/candle/open-candle-aggregator';
import { convertTdxNativeSnapshot } from '../../../../apps/mist/src/sources/tdx/realtime/native-snapshot.converter';

const SECURITY_ID = 1;
const SOURCE = 'tdx' as const;
const TRADING_DAY = '2026-08-10';

interface Scenario {
  name: string;
  sigmaPerSec: number; // slow random-walk sigma (yuan/sec)
  burstRate: number; // probability per second a transient price burst starts
  burstDepthRel: number; // burst depth as fraction of price (e.g. 0.005 = 0.5%)
  burstVolumeFactor: number; // burst trades volume multiplier vs base per-second volume
  burstSeconds: number; // burst duration in seconds (must fit inside a 3s sampling gap)
  volumeBasePerSec: number; // 手 per second
  volumeNoise: number; // relative noise
  missingFieldRate: number; // probability a frame lacks Volume or Amount
  volumeRounding: 'none' | 'floor' | 'nearest'; // provider lot granularity
  minutes: number;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'A smooth exact',
    sigmaPerSec: 0.15,
    burstRate: 0,
    burstDepthRel: 0,
    burstVolumeFactor: 1,
    burstSeconds: 2,
    volumeBasePerSec: 2,
    volumeNoise: 0.3,
    missingFieldRate: 0,
    volumeRounding: 'none',
    minutes: 60,
  },
  {
    name: 'A2 transient bursts exact',
    sigmaPerSec: 0.05,
    burstRate: 0.009,
    burstDepthRel: 0.008,
    burstVolumeFactor: 30,
    burstSeconds: 1,
    volumeBasePerSec: 2,
    volumeNoise: 0.3,
    missingFieldRate: 0,
    volumeRounding: 'none',
    minutes: 60,
  },
  {
    name: 'B bursts 2% missing field',
    sigmaPerSec: 0.05,
    burstRate: 0.009,
    burstDepthRel: 0.008,
    burstVolumeFactor: 30,
    burstSeconds: 1,
    volumeBasePerSec: 2,
    volumeNoise: 0.3,
    missingFieldRate: 0.02,
    volumeRounding: 'none',
    minutes: 60,
  },
  {
    name: 'C bursts floor 手',
    sigmaPerSec: 0.05,
    burstRate: 0.009,
    burstDepthRel: 0.008,
    burstVolumeFactor: 30,
    burstSeconds: 1,
    volumeBasePerSec: 2,
    volumeNoise: 0.3,
    missingFieldRate: 0,
    volumeRounding: 'floor',
    minutes: 60,
  },
  {
    name: 'C2 bursts nearest 手',
    sigmaPerSec: 0.05,
    burstRate: 0.009,
    burstDepthRel: 0.008,
    burstVolumeFactor: 30,
    burstSeconds: 1,
    volumeBasePerSec: 2,
    volumeNoise: 0.3,
    missingFieldRate: 0,
    volumeRounding: 'nearest',
    minutes: 60,
  },
];

// Deterministic LCG so the evidence is reproducible across runs.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface BucketResult {
  bucketStartMs: number;
  v: string | null;
  a: string | null;
  low: number;
  high: number;
  vwap: number | null;
  deviationYuan: number | null; // signed distance to the nearest band edge (0 = inside)
  deviationPct: number | null; // relative to price scale
  trueVwap: number | null; // trade-weighted avg over the true minute window
  trueInBand: boolean | null; // true vwap inside the sampled band?
  windowErrPct: number | null; // (sealed vwap - true vwap) / price
}

function shanghaiMs(
  hour: number,
  minute: number,
  second: number,
  ms = 0,
): number {
  return Date.UTC(2026, 7, 10, hour - 8, minute, second, ms); // UTC = CST - 8h
}

function rfc3339(ms: number): string {
  // +08:00 offset form, second precision (mirrors the bridge time.strftime).
  // Wall components are CST: UTC + 8h.
  const d = new Date(ms + 8 * 3600 * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+08:00`;
}

function runScenario(sc: Scenario, seed: number): BucketResult[] {
  const rng = makeRng(seed);
  const startMs = shanghaiMs(10, 0, 0);
  const totalSeconds = sc.minutes * 60;

  // Per-second trades: slow drift + transient price bursts that revert inside a
  // 3s sampling gap (the sampled band misses them, but their trades pull vwap).
  const prices: number[] = [];
  const vols: number[] = []; // 手
  let price = 1350;
  let burstRemaining = 0; // seconds until the current burst reverts
  let burstTarget = 0; // price to revert toward
  for (let s = 0; s < totalSeconds; s++) {
    if (burstRemaining > 0) {
      // Mean-revert toward the burst target (transient spike).
      price += (burstTarget - price) * 0.6;
      burstRemaining--;
    } else {
      const drift = (rng() - 0.5) * 2 * sc.sigmaPerSec;
      price = Math.max(0.01, price + drift);
      if (sc.burstRate > 0 && rng() < sc.burstRate) {
        burstTarget = price;
        price *= 1 + (rng() - 0.5) * 2 * sc.burstDepthRel;
        burstRemaining = sc.burstSeconds;
      }
    }
    prices.push(price);
    const burstBoost = burstRemaining > 0 ? sc.burstVolumeFactor : 1;
    const vol =
      sc.volumeBasePerSec *
      burstBoost *
      (1 + (rng() - 0.5) * 2 * sc.volumeNoise);
    vols.push(Math.max(0.01, vol));
  }

  // Cumulative day totals as-of each second (volume in 手, amount in 元).
  let cumVol = 0;
  let cumAmt = 0;
  const cumVolBySec: number[] = [];
  const cumAmtBySec: number[] = [];
  for (let s = 0; s < totalSeconds; s++) {
    cumVol += vols[s];
    cumAmt += prices[s] * vols[s] * 100; // 股 -> 元
    cumVolBySec.push(cumVol);
    cumAmtBySec.push(cumAmt);
  }

  // Bridge frames: every 3s from :01, capture-second truncated, cumulatives as-of floor(second).
  const aggregator = new OpenCandleAggregator();
  const results: BucketResult[] = [];
  const priorClosingTotals = {
    tradingDay: TRADING_DAY,
    cumulativeVolume: '0',
    cumulativeAmount: '0',
  };

  for (let m = 0; m < sc.minutes; m++) {
    const minuteStartSec = m * 60;
    for (let sec = 1; sec <= 58; sec += 3) {
      const captureMs = startMs + (minuteStartSec + sec) * 1000 + 200; // e.g. :01.2
      const secondIdx = minuteStartSec + sec;
      const vShou = cumVolBySec[secondIdx];
      const amtWan = cumAmtBySec[secondIdx] / 10000;
      const missing = sc.missingFieldRate > 0 && rng() < sc.missingFieldRate;
      const missingVolume = missing && rng() < 0.5;
      const missingAmount = missing && !missingVolume;

      const native: Record<string, unknown> = { Now: prices[secondIdx] };
      if (!missingVolume) {
        native['Volume'] =
          sc.volumeRounding === 'floor'
            ? String(Math.floor(vShou))
            : sc.volumeRounding === 'nearest'
              ? String(Math.round(vShou))
              : vShou.toFixed(2); // provider-style 2-decimal 手 text
      }
      if (!missingAmount) {
        native['Amount'] = amtWan.toFixed(2);
      }

      const snapshot = convertTdxNativeSnapshot({
        securityId: SECURITY_ID,
        providerSymbol: '600519.SH',
        capturedAt: rfc3339(captureMs),
        native,
      });
      const outcome = aggregator.applySnapshot(snapshot, {
        priorClosingTotals,
      });
      if (outcome.kind === 'rolled-over') {
        const sealed = aggregator.freezeCandidate(
          SECURITY_ID,
          SOURCE,
          outcome.prior.bucketStartMs,
        );
        aggregator.commitCandidate(
          SECURITY_ID,
          SOURCE,
          outcome.prior.bucketStartMs,
        );
        if (sealed) results.push(analyze(sealed, prices, vols, m - 1));
      }
    }
  }
  // Final bucket (current candidate) — freeze and commit.
  const open = aggregator.peekOpen(SECURITY_ID, SOURCE);
  if (open) {
    const sealed = aggregator.freezeCandidate(
      SECURITY_ID,
      SOURCE,
      open.bucketStartMs,
    );
    if (sealed) results.push(analyze(sealed, prices, vols, sc.minutes - 1));
  }
  return results;
}

function analyze(
  sealed: {
    bucketStartMs: number;
    volume: string | null;
    amount: string | null;
    low: number;
    high: number;
    firstEventTime: string;
    lastEventTime: string;
  },
  prices: number[],
  vols: number[],
  minuteIndex: number,
): BucketResult {
  const v = sealed.volume;
  const a = sealed.amount;
  const vwap =
    v && a && parseFloat(v) > 0 ? parseFloat(a) / parseFloat(v) : null;
  let deviationYuan: number | null = null;
  let deviationPct: number | null = null;
  if (vwap !== null) {
    if (vwap < sealed.low) deviationYuan = vwap - sealed.low;
    else if (vwap > sealed.high) deviationYuan = vwap - sealed.high;
    else deviationYuan = 0;
    deviationPct =
      deviationYuan === 0 ? 0 : (deviationYuan / sealed.high) * 100;
  }

  // True minute window (trade-weighted, exact) for the same wall-clock minute.
  const startSec = minuteIndex * 60;
  let tv = 0;
  let ta = 0;
  for (let s = startSec; s < startSec + 60 && s < prices.length; s++) {
    tv += vols[s];
    ta += prices[s] * vols[s] * 100;
  }
  const trueVwap = tv > 0 ? ta / (tv * 100) : null; // 元 / 股
  const trueInBand =
    trueVwap === null
      ? null
      : trueVwap >= sealed.low && trueVwap <= sealed.high;
  const windowErrPct =
    vwap !== null && trueVwap !== null
      ? ((vwap - trueVwap) / trueVwap) * 100
      : null;

  return {
    bucketStartMs: sealed.bucketStartMs,
    v,
    a,
    low: sealed.low,
    high: sealed.high,
    vwap,
    deviationYuan,
    deviationPct,
    trueVwap,
    trueInBand,
    windowErrPct,
  };
}

function summarize(sc: Scenario, results: BucketResult[]): void {
  const checked = results.filter((r) => r.vwap !== null);
  const out = checked.filter((r) => (r.deviationYuan ?? 0) !== 0);
  const below = out.filter((r) => (r.deviationYuan ?? 0) < 0);
  const above = out.filter((r) => (r.deviationYuan ?? 0) > 0);
  const absDevs = out
    .map((r) => Math.abs(r.deviationYuan ?? 0))
    .sort((x, y) => x - y);
  const pct = (arr: number[], q: number) =>
    arr.length === 0
      ? 0
      : arr[Math.min(arr.length - 1, Math.floor(q * arr.length))];
  const trueMiss = checked.filter((r) => r.trueInBand === false).length;
  const winErrAbs = checked
    .map((r) => Math.abs(r.windowErrPct ?? 0))
    .sort((x, y) => x - y);
  console.log(`\n== ${sc.name} (seed=${SEED}) ==`);
  console.log(
    `  buckets=${results.length} checked=${checked.length} nullVwap=${results.length - checked.length}`,
  );
  console.log(
    `  outOfRange=${out.length} (${((out.length / checked.length) * 100).toFixed(1)}%)  belowLow=${below.length} aboveHigh=${above.length}`,
  );
  console.log(
    `  deviationYuan: min=${absDevs.length ? absDevs[0].toFixed(4) : '-'} p50=${absDevs.length ? pct(absDevs, 0.5).toFixed(4) : '-'} max=${absDevs.length ? absDevs[absDevs.length - 1].toFixed(4) : '-'}`,
  );
  console.log(
    `  deviationPct:  min=${out.length ? Math.min(...out.map((r) => Math.abs(r.deviationPct ?? 0))).toFixed(3) : '-'} max=${out.length ? Math.max(...out.map((r) => Math.abs(r.deviationPct ?? 0))).toFixed(3) : '-'}`,
  );
  console.log(
    `  trueVwap outside sampled band: ${trueMiss}/${checked.length} (${((trueMiss / Math.max(1, checked.length)) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  |sealedVwap - trueVwap| (window error): p50=${pct(winErrAbs, 0.5).toFixed(4)}% p95=${pct(winErrAbs, 0.95).toFixed(4)}% max=${winErrAbs.length ? winErrAbs[winErrAbs.length - 1].toFixed(4) : '-'}%`,
  );
}

const SEED = 20260810;
for (const sc of SCENARIOS) {
  const results = runScenario(sc, SEED);
  summarize(sc, results);
}

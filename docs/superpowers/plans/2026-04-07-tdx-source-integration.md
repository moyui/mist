# TDX Data Source Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate TDX (通达信) data source from mist-datasource into mist NestJS project for K-line historical data fetching and real-time WebSocket streaming.

**Architecture:**
- TDX HTTP REST API calls via `TdxSource` for historical K-line data
- WebSocket connection via `TdxWebSocketService` for real-time quotes with in-memory K-line aggregation via `KCandleAggregator`
- Generic `ISourceFetcher<TRaw>` interface with union type `SourceData = KData | TdxResponse` for type-safe source-agnostic data flow
- Direct class injection pattern (no Symbol tokens) following existing East Money pattern

**Tech Stack:**
- NestJS with TypeORM for persistence
- Axios for HTTP calls to mist-datasource (port 9001)
- ws library for WebSocket client connection
- date-fns for time operations (Beijing timezone)

---

## File Structure

```
apps/mist/src/sources/
  source-fetcher.interface.ts              MODIFY - add generic <TRaw = KData>

  east-money/                             CREATE
    east-money-source.service.ts           MOVE from east-money.source.ts
    east-money-source.service.spec.ts     MOVE from east-money.source.spec.ts
    types.ts                               CREATE - EfExtension, EfMinuteResponse, EfDailyResponse

  tdx/                                    CREATE
    tdx-source.interface.ts                CREATE - ITdxSourceFetcher extends ISourceFetcher<TdxResponse>
    tdx-source.service.ts                  CREATE - implements ITdxSourceFetcher (HTTP REST)
    tdx-source.service.spec.ts            CREATE - unit tests
    tdx-websocket.service.ts               CREATE - WebSocket client + aggregation + hooks
    tdx-websocket.service.spec.ts         CREATE - unit tests
    kcandle-aggregator.ts                  CREATE - pure logic K-line aggregation
    kcandle-aggregator.spec.ts            CREATE - unit tests
    types.ts                               CREATE - TdxExtension, TdxResponse, TdxSnapshot

apps/mist/src/collector/
  collector.module.ts                      MODIFY - add KExtensionTdx to forFeature, update imports
  collector.service.ts                     MODIFY - add SourceData type, update Map type
  strategies/
    websocket-collection.strategy.ts       MODIFY - delegate to TdxWebSocketService

libs/config/src/
  validation.schema.ts                     MODIFY - add TDX_BASE_URL to mistEnvSchema and chanEnvSchema
```

---

## Task 1: Refactor Directory Structure and Generic Interface

**Files:**
- Create: `apps/mist/src/sources/east-money/` directory
- Create: `apps/mist/src/sources/tdx/` directory
- Modify: `apps/mist/src/sources/source-fetcher.interface.ts`
- Move: `apps/mist/src/sources/east-money.source.ts` → `apps/mist/src/sources/east-money/east-money-source.service.ts`
- Move: `apps/mist/src/sources/east-money.source.spec.ts` → `apps/mist/src/sources/east-money/east-money-source.service.spec.ts`
- Move: `apps/mist/src/sources/tdx.source.ts` → `apps/mist/src/sources/tdx/tdx-source.service.ts` (temporarily, will rewrite)
- Move: `apps/mist/src/sources/tdx.source.spec.ts` → `apps/mist/src/sources/tdx/tdx-source.service.spec.ts` (temporarily)

### Subtask 1.1: Create subdirectories and move East Money files

- [ ] **Step 1: Create east-money directory**

Run:
```bash
mkdir -p /Users/xiyugao/code/mist/mist/apps/mist/src/sources/east-money
```

- [ ] **Step 2: Create tdx directory**

Run:
```bash
mkdir -p /Users/xiyugao/code/mist/mist/apps/mist/src/sources/tdx
```

- [ ] **Step 3: Move East Money source file**

Run:
```bash
git mv apps/mist/src/sources/east-money.source.ts apps/mist/src/sources/east-money/east-money-source.service.ts
```

- [ ] **Step 4: Move East Money test file**

Run:
```bash
git mv apps/mist/src/sources/east-money.source.spec.ts apps/mist/src/sources/east-money/east-money-source.service.spec.ts
```

- [ ] **Step 5: Move TDX source file**

Run:
```bash
git mv apps/mist/src/sources/tdx.source.ts apps/mist/src/sources/tdx/tdx-source.service.ts
```

- [ ] **Step 6: Move TDX test file**

Run:
```bash
git mv apps/mist/src/sources/tdx.source.spec.ts apps/mist/src/sources/tdx/tdx-source.service.spec.ts
```

- [ ] **Step 7: Commit**

Run:
```bash
git add apps/mist/src/sources/
git commit -m "refactor: reorganize sources/ directory structure

- Create east-money/ and tdx/ subdirectories
- Move east-money.source.ts → east-money/east-money-source.service.ts
- Move tdx.source.ts → tdx/tdx-source.service.ts
- Move corresponding test files

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Subtask 1.2: Update source-fetcher.interface.ts with generics

- [ ] **Step 1: Read current interface file**

Run:
```bash
cat apps/mist/src/sources/source-fetcher.interface.ts
```

- [ ] **Step 2: Add generic parameter to ISourceFetcher**

Modify `apps/mist/src/sources/source-fetcher.interface.ts`:

```typescript
// Line ~4, change from:
export interface ISourceFetcher {
// To:
export interface ISourceFetcher<TRaw = KData> {

  // Line ~6, change from:
  fetchK(params: KFetchParams): Promise<KData[]>;
  // To:
  fetchK(params: KFetchParams): Promise<TRaw[]>;

  // Line ~7, change from:
  saveK(data: KData[], security: Security, period: Period): Promise<void>;
  // To:
  saveK(data: TRaw[], security: Security, period: Period): Promise<void>;
```

- [ ] **Step 3: Verify no TypeScript errors**

Run:
```bash
cd apps/mist && npx tsc --noEmit --skipLibCheck 2>&1 | grep source-fetcher || echo "No errors in source-fetcher.interface.ts"
```

Expected: No TypeScript errors related to source-fetcher.interface.ts

- [ ] **Step 4: Commit**

Run:
```bash
git add apps/mist/src/sources/source-fetcher.interface.ts
git commit -m "refactor: add generic parameter to ISourceFetcher interface

- ISourceFetcher<TRaw = KData> allows source-specific intermediate types
- East Money uses default KData, TDX will use TdxResponse
- Conversion to K entity happens in saveK for each source

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Create East Money Types

**Files:**
- Create: `apps/mist/src/sources/east-money/types.ts`
- Modify: `apps/mist/src/sources/east-money/east-money-source.service.ts`

### Subtask 2.1: Create east-money/types.ts

- [ ] **Step 1: Create types.ts file**

Create `apps/mist/src/sources/east-money/types.ts`:

```typescript
/**
 * East Money K-line extension fields (from index_zh_a_hist_min_em API)
 */
export interface EfExtension {
  fullCode?: string;
  amplitude?: number;
  changePct?: number;
  changeAmt?: number;
  turnoverRate?: number;
}

/**
 * East Money minute-level K-line API response
 */
export interface EfMinuteVo {
  时间: string;
  开盘: number;
  收盘: number;
  最高: number;
  最低: number;
  涨跌幅?: number;
  涨跌额?: number;
  成交量: number;
  成交额: number;
  振幅?: number;
  换手率?: number;
}

/**
 * East Money daily K-line API response
 */
export interface EfDailyVo {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd apps/mist && npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(error TS|east-money)" || echo "No errors in east-money/types.ts"
```

Expected: No errors

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/src/sources/east-money/types.ts
git commit -m "feat(east-money): add types.ts with EfExtension and response types

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Subtask 2.2: Update east-money-source.service.ts to use types

- [ ] **Step 1: Read current east-money-source.service.ts**

Run:
```bash
cat apps/mist/src/sources/east-money/east-money-source.service.ts | head -50
```

- [ ] **Step 2: Remove inline type definitions and import from types.ts**

Modify `apps/mist/src/sources/east-money/east-money-source.service.ts`:

```typescript
// Around line 1-6, add import:
import { EfExtension, EfMinuteVo, EfDailyVo } from './types';

// Around line 22-48, DELETE these lines (interface SecurityPeriodVo and SecurityDailyVo)
// The types are now imported from ./types.ts

// Around line 10, update imports:
// DELETE: EfExtension from './source-fetcher.interface'
// EfExtension is now imported from './types'
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
cd apps/mist && npx tsc --noEmit --skipLibCheck 2>&1 | grep "east-money-source.service" || echo "No errors in east-money-source.service.ts"
```

Expected: No errors

- [ ] **Step 4: Run tests to ensure no regression**

Run:
```bash
cd apps/mist && npm test -- east-money-source.service.spec.ts
```

Expected: All tests pass

- [ ] **Step 5: Commit**

Run:
```bash
git add apps/mist/src/sources/east-money/east-money-source.service.ts
git commit -m "refactor(east-money): use types from types.ts

- Remove inline type definitions
- Import EfExtension, EfMinuteVo, EfDailyVo from ./types

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Create TDX Types

**Files:**
- Create: `apps/mist/src/sources/tdx/types.ts`
- Modify: `apps/mist/src/sources/source-fetcher.interface.ts` (re-export for backward compat)

### Subtask 3.1: Create tdx/types.ts

- [ ] **Step 1: Create types.ts file**

Create `apps/mist/src/sources/tdx/types.ts`:

```typescript
/**
 * Parsed K-line data from mist-datasource /api/tdx/market-data
 * Raw HTTP response {field: {stockCode: [values]}} is parsed into this format
 */
export interface TdxResponse {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  forwardFactor?: number;
}

/**
 * Real-time snapshot from mist-datasource WebSocket
 * Parsed from WS message {type: "quote", data: {stock_code, snapshot: {...}}}
 */
export interface TdxSnapshot {
  stockCode: string;      // e.g., "SH600519"
  now: number;            // current price
  open: number;
  high: number;
  low: number;
  lastClose: number;      // previous close
  volume: number;
  amount: number;
  timestamp: Date;
}

/**
 * TDX K-line extension fields
 * Maps to KExtensionTdx entity in @app/shared-data
 */
export interface TdxExtension {
  fullCode?: string;
  forwardFactor?: number;
  backwardFactor?: number;
  volumeRatio?: number;
  turnoverRate?: number;
  turnoverAmount?: number;
  totalMarketValue?: number;
  floatMarketValue?: number;
  earningsPerShare?: number;
  priceEarningsRatio?: number;
  priceToBookRatio?: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd apps/mist && npx tsc --noEmit --skipLibCheck 2>&1 | grep "tdx/types" || echo "No errors in tdx/types.ts"
```

Expected: No errors

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/types.ts
git commit -m "feat(tdx): add types.ts with TdxResponse, TdxSnapshot, TdxExtension

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Subtask 3.2: Update source-fetcher.interface.ts to re-export TDX types

- [ ] **Step 1: Add re-exports for backward compatibility**

Modify `apps/mist/src/sources/source-fetcher.interface.ts`:

```typescript
// At the end of the file (before export), add:
// Re-export TDX types from tdx/types for backward compatibility
export type { TdxExtension } from './tdx/types';
```

Note: Keep existing TdxExtension definition for now to avoid breaking existing imports. Will remove in Task 4 after all imports are updated.

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd apps/mist && npx tsc --noEmit --skipLibCheck 2>&1 | grep "source-fetcher" || echo "No errors in source-fetcher.interface.ts"
```

Expected: No errors

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/src/sources/source-fetcher.interface.ts
git commit -m "refactor: re-export TdxExtension from tdx/types

- Maintain backward compatibility during migration
- Existing imports of TdxExtension still work

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Create ITdxSourceFetcher Interface

**Files:**
- Create: `apps/mist/src/sources/tdx/tdx-source.interface.ts`

### Subtask 4.1: Create ITdxSourceFetcher interface

- [ ] **Step 1: Create tdx-source.interface.ts**

Create `apps/mist/src/sources/tdx/tdx-source.interface.ts`:

```typescript
import { ISourceFetcher, KFetchParams, Period, Security } from '../source-fetcher.interface';
import { TdxResponse, TdxSnapshot } from './types';

/**
 * TDX-specific source fetcher interface
 * Extends base ISourceFetcher with TDX raw data type and additional methods
 */
export interface ITdxSourceFetcher extends ISourceFetcher<TdxResponse> {
  /**
   * Fetch real-time snapshot for a single stock
   */
  fetchSnapshot(stockCode: string): Promise<TdxSnapshot>;

  /**
   * Fetch dividend factors for a stock
   */
  fetchDividFactors(stockCode: string, startDate: Date, endDate: Date): Promise<{
    timestamp: Date;
    forwardFactor: number;
    backwardFactor: number;
  }[]>;

  /**
   * Check if TDX supports a specific period
   * TDX supports: 1m, 5m, 15m, 30m, 60m, 1d, 1w, 1M
   */
  isSupportedPeriod(period: Period): boolean;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd apps/mist && npx tsc --noEmit --skipLibCheck 2>&1 | grep "tdx-source.interface" || echo "No errors in tdx-source.interface.ts"
```

Expected: No errors

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/tdx-source.interface.ts
git commit -m "feat(tdx): add ITdxSourceFetcher interface

- Extends ISourceFetcher<TdxResponse>
- Adds fetchSnapshot, fetchDividFactors methods
- TDX supports 1m, 5m, 15m, 30m, 60m, 1d, 1w, 1M periods

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Implement KCandleAggregator (Pure Logic)

**Files:**
- Create: `apps/mist/src/sources/tdx/kcandle-aggregator.ts`
- Create: `apps/mist/src/sources/tdx/kcandle-aggregator.spec.ts`

### Subtask 5.1: Write failing tests for KCandleAggregator

- [ ] **Step 1: Create test file with failing tests**

Create `apps/mist/src/sources/tdx/kcandle-aggregator.spec.ts`:

```typescript
import { KCandleAggregator } from './kcandle-aggregator';
import { Period } from '@app/shared-data';
import { TdxSnapshot } from './types';
import { describe, it, expect, beforeEach } from '@jest/globals';

describe('KCandleAggregator', () => {
  let aggregator: KCandleAggregator;
  const mockSnapshot = (time: string, price: number, volume: number): TdxSnapshot => ({
    stockCode: 'SH600519',
    now: price,
    open: 1750,
    high: 1760,
    low: 1740,
    lastClose: 1745,
    volume,
    amount: volume * price,
    timestamp: new Date(`2024-01-02T${time}:00Z`),
  });

  beforeEach(() => {
    aggregator = new KCandleAggregator();
  });

  describe('1-minute aggregation', () => {
    it('should emit completed candle on minute boundary', () => {
      const candles: any[] = [];
      aggregator.on('candle', (candle) => candles.push(candle));

      // 9:30:00 - first tick of first candle
      aggregator.process('SH600519', Period.MIN_1, mockSnapshot('09:30', 1750, 100));
      expect(candles.length).toBe(0);

      // 9:30:30 - still same candle
      aggregator.process('SH600519', Period.MIN_1, mockSnapshot('09:30:30', 1755, 50));
      expect(candles.length).toBe(0);

      // 9:31:00 - first tick of next candle, should emit 9:30 candle
      aggregator.process('SH600519', Period.MIN_1, mockSnapshot('09:31', 1760, 80));
      expect(candles.length).toBe(1);
      expect(candles[0].timestamp).toEqual(new Date('2024-01-02T09:30:00Z'));
      expect(candles[0].open).toBe(1750);
      expect(candles[0].high).toBe(1755);
      expect(candles[0].low).toBe(1750);
      expect(candles[0].close).toBe(1755);
      expect(candles[0].volume).toBe(150);
    });

    it('should track OHLC correctly across multiple ticks', () => {
      const candles: any[] = [];
      aggregator.on('candle', (candle) => candles.push(candle));

      aggregator.process('SH600519', Period.MIN_1, mockSnapshot('09:30', 1750, 100));
      aggregator.process('SH600519', Period.MIN_1, mockSnapshot('09:30:20', 1745, 50));
      aggregator.process('SH600519', Period.MIN_1, mockSnapshot('09:30:40', 1760, 30));
      aggregator.process('SH600519', Period.MIN_1, mockSnapshot('09:31', 1755, 80));

      expect(candles.length).toBe(1);
      expect(candles[0].open).toBe(1750);
      expect(candles[0].high).toBe(1760);
      expect(candles[0].low).toBe(1745);
      expect(candles[0].close).toBe(1760);
      expect(candles[0].volume).toBe(180);
    });
  });

  describe('5-minute aggregation', () => {
    it('should align to :00, :05, :10 boundaries', () => {
      const candles: any[] = [];
      aggregator.on('candle', (candle) => candles.push(candle));

      // 9:30-9:35 candle
      aggregator.process('SH600519', Period.MIN_5, mockSnapshot('09:30', 1750, 100));
      aggregator.process('SH600519', Period.MIN_5, mockSnapshot('09:35', 1760, 80));

      expect(candles.length).toBe(1);
      expect(candles[0].timestamp).toEqual(new Date('2024-01-02T09:30:00Z'));

      // 9:35-9:40 candle
      aggregator.process('SH600519', Period.MIN_5, mockSnapshot('09:40', 1770, 90));

      expect(candles.length).toBe(2);
      expect(candles[1].timestamp).toEqual(new Date('2024-01-02T09:35:00Z'));
    });
  });

  describe('multiple stocks and periods', () => {
    it('should track different stocks independently', () => {
      const candles: any[] = [];
      aggregator.on('candle', (candle) => candles.push(candle));

      const mockSh = (time: string) => mockSnapshot(time, 1750, 100);
      const mockSz = (time: string) => ({ ...mockSnapshot(time, 12.5, 1000), stockCode: 'SZ000001' });

      aggregator.process('SH600519', Period.MIN_1, mockSh('09:30'));
      aggregator.process('SZ000001', Period.MIN_1, mockSz('09:30'));
      aggregator.process('SH600519', Period.MIN_1, mockSh('09:31'));
      aggregator.process('SZ000001', Period.MIN_1, mockSz('09:31'));

      expect(candles.length).toBe(2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/mist && npm test -- kcandle-aggregator.spec.ts 2>&1 | head -50
```

Expected: FAIL with "KCandleAggregator is not defined" or similar

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/kcandle-aggregator.spec.ts
git commit -m "test(tdx): add KCandleAggregator unit tests

- Test 1-minute period boundary detection
- Test OHLCV accumulation
- Test 5-minute alignment
- Test multiple stocks and periods

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Subtask 5.2: Implement KCandleAggregator

- [ ] **Step 1: Create KCandleAggregator class**

Create `apps/mist/src/sources/tdx/kcandle-aggregator.ts`:

```typescript
import { EventEmitter } from 'events';
import { Period } from '@app/shared-data';
import { TdxSnapshot } from './types';

interface InProgressCandle {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
}

interface CompletedCandle extends InProgressCandle {
  stockCode: string;
  period: Period;
}

/**
 * Pure logic component for aggregating TDX snapshots into K-line candles
 * Thread-safe (Node.js single-threaded event loop guarantees ordering)
 */
export class KCandleAggregator {
  private readonly candles = new Map<string, InProgressCandle>();
  private readonly emitter = new EventEmitter();

  constructor() {
    // Set max listeners to accommodate multiple stocks + periods
    this.emitter.setMaxListeners(100);
  }

  /**
   * Register callback for completed candles
   */
  on(event: 'candle', callback: (candle: CompletedCandle) => void): void {
    this.emitter.on(event, callback);
  }

  /**
   * Process a snapshot and update aggregation state
   * Emits completed candle when period boundary is crossed
   */
  process(stockCode: string, period: Period, snapshot: TdxSnapshot): void {
    const key = this.makeKey(stockCode, period);
    const candleTime = this.getCandleTime(snapshot.timestamp, period);

    const existing = this.candles.get(key);

    // Check if period boundary crossed
    if (existing && existing.timestamp.getTime() !== candleTime.getTime()) {
      // Emit completed candle
      this.emitter.emit('candle', {
        stockCode,
        period,
        ...existing,
      } as CompletedCandle);
    }

    // Update or create candle
    const candle: InProgressCandle = existing || {
      timestamp: candleTime,
      open: snapshot.open,
      high: snapshot.high,
      low: snapshot.low,
      close: snapshot.now,
      volume: 0,
      amount: 0,
    };

    // Update OHLCV
    candle.high = Math.max(candle.high, snapshot.high);
    candle.low = Math.min(candle.low, snapshot.low);
    candle.close = snapshot.now;
    candle.volume += snapshot.volume;
    candle.amount += snapshot.amount;

    this.candles.set(key, candle);
  }

  /**
   * Get current in-progress candle for a stock+period (for testing)
   */
  getCurrent(stockCode: string, period: Period): InProgressCandle | undefined {
    return this.candles.get(this.makeKey(stockCode, period));
  }

  /**
   * Get candle time (start of period) for a given timestamp
   * Boundary tick (exact on boundary) belongs to NEW candle
   */
  private getCandleTime(timestamp: Date, period: Period): Date {
    const dt = new Date(timestamp);

    switch (period) {
      case Period.MIN_1:
        // Floor to minute
        dt.setSeconds(0, 0);
        return dt;

      case Period.MIN_5:
        // Align to :00, :05, :10, ...
        const minutes5 = Math.floor(dt.getMinutes() / 5) * 5;
        dt.setMinutes(minutes5, 0, 0);
        return dt;

      case Period.MIN_15:
        // Align to :00, :15, :30, :45
        const minutes15 = Math.floor(dt.getMinutes() / 15) * 15;
        dt.setMinutes(minutes15, 0, 0);
        return dt;

      case Period.MIN_30:
        // Align to :00, :30
        const minutes30 = Math.floor(dt.getMinutes() / 30) * 30;
        dt.setMinutes(minutes30, 0, 0);
        return dt;

      case Period.MIN_60:
        // Align to hour
        dt.setMinutes(0, 0, 0);
        return dt;

      default:
        // Daily and longer - not produced from snapshots
        dt.setHours(0, 0, 0, 0);
        return dt;
    }
  }

  private makeKey(stockCode: string, period: Period): string {
    return `${stockCode}:${period}`;
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
cd apps/mist && npm test -- kcandle-aggregator.spec.ts
```

Expected: PASS all tests

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/kcandle-aggregator.ts apps/mist/src/sources/tdx/kcandle-aggregator.spec.ts
git commit -m "feat(tdx): implement KCandleAggregator

- Pure logic component for snapshot → K-line aggregation
- Supports 1m, 5m, 15m, 30m, 60m period alignment
- Multi-stock, multi-period tracking
- Event-driven completed candle emission

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Implement TdxSource (HTTP REST)

**Files:**
- Modify: `apps/mist/src/sources/tdx/tdx-source.service.ts` (complete rewrite)
- Create: `apps/mist/src/sources/tdx/tdx-source.service.spec.ts`

### Subtask 6.1: Add TDX_BASE_URL to config schema

- [ ] **Step 1: Read current validation schema**

Run:
```bash
cat libs/config/src/validation.schema.ts | grep -A 20 "mistEnvSchema"
```

- [ ] **Step 2: Add TDX_BASE_URL to mistEnvSchema**

Modify `libs/config/src/validation.schema.ts`:

```typescript
// In mistEnvSchema object, add TDX_BASE_URL validation:
TDX_BASE_URL: Joi.string().uri().optional().description('TDX data source base URL'),
```

- [ ] **Step 3: Add TDX_BASE_URL to chanEnvSchema too**

Modify `libs/config/src/validation.schema.ts`:

```typescript
// In chanEnvSchema object, add TDX_BASE_URL validation:
TDX_BASE_URL: Joi.string().uri().optional().description('TDX data source base URL'),
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
npx tsc --noEmit --skipLibCheck 2>&1 | grep "validation.schema" || echo "No errors"
```

Expected: No errors

- [ ] **Step 5: Commit**

Run:
```bash
git add libs/config/src/validation.schema.ts
git commit -m "feat(config): add TDX_BASE_URL to validation schemas

- Add to mistEnvSchema and chanEnvSchema
- Optional URI string for mist-datasource endpoint

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Subtask 6.2: Write tests for TdxSource

- [ ] **Step 1: Create test file**

Create `apps/mist/src/sources/tdx/tdx-source.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TdxSource } from './tdx-source.service';
import { DataSource, Period } from '@app/shared-data';
import { Security } from '@app/shared-data';
import { AxiosInstance } from 'axios';
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

describe('TdxSource', () => {
  let service: TdxSource;
  let mockAxios: jest.Mocked<AxiosInstance>;
  let mockTypeOrmDataSource: any;

  const mockSecurity: Security = {
    id: 1,
    code: '600519',
    name: '贵州茅台',
    type: 'stock' as any,
    status: 'active' as any,
    listDate: new Date('2001-08-27'),
    delistDate: null,
    sourceConfigs: [
      {
        id: 1,
        securityId: 1,
        source: DataSource.TDX,
        formatCode: 'SH600519',
        priority: 1,
        enabled: true,
      },
    ],
  };

  beforeEach(async () => {
    mockAxios = {
      get: jest.fn(),
      post: jest.fn(),
    } as any;

    mockTypeOrmDataSource = {
      transaction: jest.fn(async (callback) => {
        const mockManager = {
          create: jest.fn((entity, data) => data),
          save: jest.fn((data) => Promise.resolve(data)),
        };
        return callback(mockManager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TdxSource,
        {
          provide: 'CONFIG_SERVICE',
          useValue: { get: jest.fn(() => 'http://localhost:9001') },
        },
        {
          provide: 'TYPEORM_DATA_SOURCE',
          useValue: mockTypeOrmDataSource,
        },
      ],
    }).compile();

    // Manually inject axios mock
    service = module.get<TdxSource>(TdxSource);
    (service as any).axios = mockAxios;
  });

  describe('fetchK', () => {
    it('should parse TDX market-data response', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            Date: { SH600519: ['20240102', '20240103'] },
            Time: { SH600519: ['093000', '093100'] },
            Open: { SH600519: [1750, 1755] },
            High: { SH600519: [1760, 1765] },
            Low: { SH600519: [1745, 1750] },
            Close: { SH600519: [1755, 1760] },
            Volume: { SH600519: [10000, 12000] },
            Amount: { SH600519: [17500000, 21120000] },
            ForwardFactor: { SH600519: [1.0, 1.0] },
          },
        },
      };

      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await service.fetchK({
        code: '600519',
        formatCode: 'SH600519',
        period: Period.MIN_1,
        startDate: new Date('2024-01-02'),
        endDate: new Date('2024-01-03'),
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        timestamp: new Date('2024-01-02T09:30:00Z'),
        open: 1750,
        high: 1760,
        low: 1745,
        close: 1755,
        volume: 10000,
        amount: 17500000,
        forwardFactor: 1.0,
      });

      expect(mockAxios.get).toHaveBeenCalledWith(
        '/api/tdx/market-data',
        expect.objectContaining({
          params: expect.objectContaining({
            stocks: 'SH600519',
            period: '1m',
          }),
        }),
      );
    });

    it('should throw on API error', async () => {
      mockAxios.get.mockRejectedValue(new Error('Network error'));

      await expect(
        service.fetchK({
          code: '600519',
          formatCode: 'SH600519',
          period: Period.MIN_1,
          startDate: new Date('2024-01-02'),
          endDate: new Date('2024-01-03'),
        }),
      ).rejects.toThrow('Network error');
    });
  });

  describe('isSupportedPeriod', () => {
    it('should support TDX periods', () => {
      expect(service.isSupportedPeriod(Period.MIN_1)).toBe(true);
      expect(service.isSupportedPeriod(Period.MIN_5)).toBe(true);
      expect(service.isSupportedPeriod(Period.DAY)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/mist && npm test -- tdx-source.service.spec.ts 2>&1 | head -50
```

Expected: FAIL - TdxSource methods not implemented correctly

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/tdx-source.service.spec.ts
git commit -m "test(tdx): add TdxSource unit tests

- Test fetchK response parsing from mist-datasource API
- Test error handling
- Test isSupportedPeriod

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Subtask 6.3: Implement TdxSource

- [ ] **Step 1: Rewrite tdx-source.service.ts**

Replace contents of `apps/mist/src/sources/tdx/tdx-source.service.ts`:

```typescript
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosInstance } from 'axios';
import { PeriodMappingService } from '@app/utils';
import {
  DataSource,
  Period,
  K,
  KExtensionTdx,
  Security,
} from '@app/shared-data';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { format } from 'date-fns';
import { ITdxSourceFetcher } from './tdx-source.interface';
import { TdxResponse, TdxSnapshot, TdxExtension } from './types';

@Injectable()
export class TdxSource implements ITdxSourceFetcher {
  private readonly axios: AxiosInstance;
  private readonly logger = new Logger(TdxSource.name);
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly periodMappingService: PeriodMappingService,
    private readonly typeOrmDataSource: TypeOrmDataSource,
  ) {
    this.baseUrl = this.configService.get<string>('TDX_BASE_URL') || 'http://127.0.0.1:9001';
    // Reuse UtilsService's axios factory pattern
    this.axios = this.createAxiosInstance();
  }

  async fetchK(params: {
    code: string;
    formatCode: string;
    period: Period;
    startDate: Date;
    endDate: Date;
  }): Promise<TdxResponse[]> {
    const { formatCode, period, startDate, endDate } = params;

    const periodFormat = this.periodMappingService.toSourceFormat(period, DataSource.TDX);
    if (!periodFormat) {
      throw new HttpException(
        `Period ${period} not supported by TDX`,
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const response = await this.axios.get<{
        success: boolean;
        data: {
          [field: string]: {
            [stockCode: string]: (string | number)[];
          };
        };
      }>('/api/tdx/market-data', {
        params: {
          stocks: formatCode,
          period: periodFormat,
          start_time: format(startDate, 'yyyyMMdd'),
          end_time: format(endDate, 'yyyyMMdd'),
          dividend_type: 'none',
        },
      });

      if (!response.data?.success || !response.data?.data) {
        throw new HttpException(
          'Invalid response from TDX API',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return this.parseMarketDataResponse(response.data.data, formatCode);
    } catch (error) {
      this.logger.error(`TDX fetchK error: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to fetch TDX data: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async fetchSnapshot(stockCode: string): Promise<TdxSnapshot> {
    try {
      const response = await this.axios.get<{
        success: boolean;
        data: {
          stock_code: string;
          snapshot: any;
        };
      }>('/api/tdx/market-snapshot', {
        params: { stock_code: stockCode },
      });

      if (!response.data?.success || !response.data?.data) {
        throw new HttpException(
          'Invalid response from TDX snapshot API',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return this.parseSnapshot(response.data.data.snapshot, stockCode);
    } catch (error) {
      this.logger.error(`TDX fetchSnapshot error: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to fetch TDX snapshot: ${error.message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async fetchDividFactors(
    stockCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ timestamp: Date; forwardFactor: number; backwardFactor: number }[]> {
    try {
      const response = await this.axios.get<{
        success: boolean;
        data: {
          date: string[];
          forward_factor: number[];
          backward_factor: number[];
        };
      }>('/api/tdx/divid-factors', {
        params: {
          stock_code: stockCode,
          start_time: format(startDate, 'yyyyMMdd'),
          end_time: format(endDate, 'yyyyMMdd'),
        },
      });

      if (!response.data?.success || !response.data?.data) {
        return [];
      }

      const { date, forward_factor, backward_factor } = response.data.data;
      return date.map((d, i) => ({
        timestamp: new Date(d),
        forwardFactor: forward_factor[i],
        backwardFactor: backward_factor[i],
      }));
    } catch (error) {
      this.logger.error(`TDX fetchDividFactors error: ${error.message}`);
      return [];
    }
  }

  async saveK(
    data: TdxResponse[],
    security: Security,
    period: Period,
  ): Promise<void> {
    if (data.length === 0) return;

    await this.typeOrmDataSource.transaction(async (manager) => {
      // Get TDX source config for this security
      const sourceConfig = security.sourceConfigs?.find(
        (sc) => sc.source === DataSource.TDX,
      );
      const formatCode = sourceConfig?.formatCode || security.code;

      const kEntities = data.map((d) =>
        manager.create(K, {
          security,
          source: DataSource.TDX,
          period,
          timestamp: d.timestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: BigInt(Math.round(d.volume)),
          amount: d.amount || 0,
        }),
      );

      try {
        const savedKs = await manager.save(K, kEntities);

        // Save TDX extensions
        const extensions = savedKs.map((k, i) => {
          const ext: Partial<TdxExtension> = {
            fullCode: formatCode,
          };
          if (data[i].forwardFactor !== undefined) {
            ext.forwardFactor = data[i].forwardFactor;
          }
          return manager.create(KExtensionTdx, {
            k,
            fullCode: ext.fullCode || '',
            forwardFactor: ext.forwardFactor ?? 0,
            backwardFactor: 0,
            volumeRatio: 0,
            turnoverRate: 0,
            turnoverAmount: 0,
            totalMarketValue: 0,
            floatMarketValue: 0,
            earningsPerShare: 0,
            priceEarningsRatio: 0,
            priceToBookRatio: 0,
          });
        });

        await manager.save(KExtensionTdx, extensions);
      } catch (error: any) {
        if (error.code === 'ER_DUP_ENTRY' || error.message?.includes('Duplicate')) {
          this.logger.warn(`Duplicate K-line entry, skipping`);
          return;
        }
        throw error;
      }
    });
  }

  isSupportedPeriod(period: Period): boolean {
    return this.periodMappingService.isSupported(period, DataSource.TDX);
  }

  /**
   * Parse mist-datasource market-data response into TdxResponse[]
   * Input format: {Date: {SH600519: [...]}, Time: {SH600519: [...]}, ...}
   */
  private parseMarketDataResponse(
    data: { [field: string]: { [stockCode: string]: (string | number)[] } },
    stockCode: string,
  ): TdxResponse[] {
    const dates = data.Date?.[stockCode] || [];
    const times = data.Time?.[stockCode] || [];
    const opens = data.Open?.[stockCode] || [];
    const highs = data.High?.[stockCode] || [];
    const lows = data.Low?.[stockCode] || [];
    const closes = data.Close?.[stockCode] || [];
    const volumes = data.Volume?.[stockCode] || [];
    const amounts = data.Amount?.[stockCode] || [];
    const forwardFactors = data.ForwardFactor?.[stockCode] || [];

    const length = dates.length;
    const result: TdxResponse[] = [];

    for (let i = 0; i < length; i++) {
      const dateStr = dates[i] as string;
      const timeStr = times[i] as string;

      // Parse timestamp: date (yyyyMMdd) + time (HHmmss)
      const timestamp = new Date(
        `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T` +
        `${timeStr.slice(0, 2)}:${timeStr.slice(2, 4)}:${timeStr.slice(4, 6)}Z`,
      );

      result.push({
        timestamp,
        open: Number(opens[i]),
        high: Number(highs[i]),
        low: Number(lows[i]),
        close: Number(closes[i]),
        volume: Number(volumes[i]),
        amount: Number(amounts[i]),
        forwardFactor: forwardFactors[i] !== undefined ? Number(forwardFactors[i]) : undefined,
      });
    }

    return result;
  }

  /**
   * Parse mist-datasource snapshot response
   */
  private parseSnapshot(data: any, stockCode: string): TdxSnapshot {
    return {
      stockCode,
      now: Number(data.Now),
      open: Number(data.Open),
      high: Number(data.Max),
      low: Number(data.Min),
      lastClose: Number(data.LastClose),
      volume: Number(data.Volume),
      amount: Number(data.Amount),
      timestamp: new Date(),
    };
  }

  /**
   * Create axios instance (same pattern as UtilsService)
   */
  private createAxiosInstance(): AxiosInstance {
    const axios = require('axios').default;
    return axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
cd apps/mist && npm test -- tdx-source.service.spec.ts
```

Expected: PASS all tests

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/tdx-source.service.ts
git commit -m "feat(tdx): implement TdxSource HTTP REST client

- Fetch K-line data from mist-datasource /api/tdx/market-data
- Parse nested {field: {stockCode: [values]}} response format
- Fetch snapshots from /api/tdx/market-snapshot
- Fetch dividend factors from /api/tdx/divid-factors
- Save K + KExtensionTdx entities with transaction
- TDX_BASE_URL config support

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Implement TdxWebSocketService

**Files:**
- Create: `apps/mist/src/sources/tdx/tdx-websocket.service.ts`
- Create: `apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts`

### Subtask 7.1: Write tests for TdxWebSocketService

- [ ] **Step 1: Create test file**

Create `apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TdxWebSocketService } from './tdx-websocket.service';
import { KCandleAggregator } from './kcandle-aggregator';
import { Period } from '@app/shared-data';
import { TdxSnapshot } from './types';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('TdxWebSocketService', () => {
  let service: TdxWebSocketService;
  let mockAggregator: KCandleAggregator;
  let mockWs: any;

  beforeEach(async () => {
    mockAggregator = {
      process: jest.fn(),
      on: jest.fn(),
    } as any;

    mockWs = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
      readyState: 3, // CLOSED
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TdxWebSocketService,
        {
          provide: KCandleAggregator,
          useValue: mockAggregator,
        },
        {
          provide: 'CONFIG_SERVICE',
          useValue: {
            get: jest.fn(() => 'http://localhost:9001'),
          },
        },
      ],
    }).compile();

    service = module.get<TdxWebSocketService>(TdxWebSocketService);

    // Mock WebSocket constructor
    (service as any).WebSocket = jest.fn(() => mockWs);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onSnapshot hook', () => {
    it('should call snapshot callback when quote received', async () => {
      const snapshotCallback = jest.fn();
      service.onSnapshot(snapshotCallback);

      // Simulate WS open and message
      const openCallback = mockWs.on.mock.calls.find((c: any[]) => c[0] === 'open')?.[1];
      const messageCallback = mockWs.on.mock.calls.find((c: any[]) => c[0] === 'message')?.[1];

      openCallback?.();
      const wsMessage = JSON.stringify({
        type: 'quote',
        data: {
          stock_code: 'SH600519',
          snapshot: {
            Now: '1755',
            Open: '1750',
            Max: '1760',
            Min: '1745',
            LastClose: '1748',
            Volume: '10000',
            Amount: '17550000',
          },
        },
      });
      messageCallback?.(wsMessage);

      // Wait for event loop
      await new Promise((resolve) => setImmediate(resolve));

      expect(snapshotCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          stockCode: 'SH600519',
          now: 1755,
        }),
      );
    });
  });

  describe('onCandleComplete hook', () => {
    it('should call candle callback when aggregator emits candle', async () => {
      const candleCallback = jest.fn();
      service.onCandleComplete(candleCallback);

      // Get the aggregator's on callback and emit a candle
      const aggCallback = mockAggregator.on.mock.calls[0]?.[1];
      aggCallback?.({
        stockCode: 'SH600519',
        period: Period.MIN_1,
        timestamp: new Date('2024-01-02T09:30:00Z'),
        open: 1750,
        high: 1760,
        low: 1745,
        close: 1755,
        volume: 10000,
        amount: 17550000,
      });

      expect(candleCallback).toHaveBeenCalled();
    });
  });

  describe('connection management', () => {
    it('should connect on module init', async () => {
      await service.onModuleInit();

      expect((service as any).WebSocket).toHaveBeenCalledWith(
        'ws://localhost:9001/ws/quote/mist-backend',
      );
    });

    it('should close connection on module destroy', async () => {
      await service.onModuleInit();
      await service.onModuleDestroy();

      expect(mockWs.close).toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd apps/mist && npm test -- tdx-websocket.service.spec.ts 2>&1 | head -50
```

Expected: FAIL - methods not implemented

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts
git commit -m "test(tdx): add TdxWebSocketService unit tests

- Test onSnapshot hook with quote message
- Test onCandleComplete hook with aggregator emission
- Test connection lifecycle (onModuleInit/onModuleDestroy)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Subtask 7.2: Implement TdxWebSocketService

- [ ] **Step 1: Create TdxWebSocketService**

Create `apps/mist/src/sources/tdx/tdx-websocket.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import { KCandleAggregator, CompletedCandle } from './kcandle-aggregator';
import { Period, Security } from '@app/shared-data';
import { TdxSnapshot, TdxResponse } from './types';

type SnapshotCallback = (snapshot: TdxSnapshot) => void | Promise<void>;
type CandleCompleteCallback = (
  candle: TdxResponse,
  security: Security,
  period: Period,
) => void | Promise<void>;

@Injectable()
export class TdxWebSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TdxWebSocketService.name);
  private readonly wsUrl: string;
  private ws: WebSocket | null = null;
  private readonly subscriptions = new Set<string>();
  private snapshotCallbacks: SnapshotCallback[] = [];
  private candleCallbacks: CandleCompleteCallback[] = [];
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private readonly reconnectDelay = 5000;

  constructor(
    private readonly configService: ConfigService,
    private readonly aggregator: KCandleAggregator,
  ) {
    const baseUrl = this.configService.get<string>('TDX_BASE_URL') || 'http://127.0.0.1:9001';
    // Convert HTTP URL to WS URL
    this.wsUrl = baseUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  }

  async onModuleInit(): Promise<void> {
    this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.disconnect();
  }

  onSnapshot(callback: SnapshotCallback): void {
    this.snapshotCallbacks.push(callback);
  }

  onCandleComplete(callback: CandleCompleteCallback): void {
    this.candleCallbacks.push(callback);
  }

  subscribe(stockCode: string): void {
    this.subscriptions.add(stockCode);
    this.sendSubscription();
  }

  unsubscribe(stockCode: string): void {
    this.subscriptions.delete(stockCode);
    this.sendSubscription();
  }

  private connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.logger.log(`Connecting to TDX WebSocket: ${this.wsUrl}`);

    try {
      this.ws = new WebSocket(`${this.wsUrl}/ws/quote/mist-backend`);

      this.ws.on('open', () => {
        this.logger.log('TDX WebSocket connected');
        this.clearReconnectTimeout();
        this.sendSubscription();
        this.startHeartbeat();
      });

      this.ws.on('message', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (error) => {
        this.logger.error(`TDX WebSocket error: ${error.message}`);
      });

      this.ws.on('close', () => {
        this.logger.warn('TDX WebSocket disconnected, reconnecting...');
        this.scheduleReconnect();
      });
    } catch (error) {
      this.logger.error(`Failed to connect to TDX WebSocket: ${error}`);
      this.scheduleReconnect();
    }
  }

  private disconnect(): void {
    this.clearReconnectTimeout();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.type === 'pong') {
        // Heartbeat response
        return;
      }

      if (message.type === 'quote') {
        const snapshot = this.parseSnapshot(message.data);
        this.processSnapshot(snapshot);
      }
    } catch (error) {
      this.logger.error(`Failed to handle WebSocket message: ${error}`);
    }
  }

  private parseSnapshot(data: { stock_code: string; snapshot: any }): TdxSnapshot {
    const s = data.snapshot;
    return {
      stockCode: data.stock_code,
      now: Number(s.Now || s.now),
      open: Number(s.Open || s.open),
      high: Number(s.Max || s.high),
      low: Number(s.Min || s.low),
      lastClose: Number(s.LastClose || s.lastClose),
      volume: Number(s.Volume || s.volume),
      amount: Number(s.Amount || s.amount),
      timestamp: new Date(),
    };
  }

  private processSnapshot(snapshot: TdxSnapshot): void {
    // Notify snapshot callbacks
    for (const callback of this.snapshotCallbacks) {
      try {
        callback(snapshot);
      } catch (error) {
        this.logger.error(`Snapshot callback error: ${error}`);
      }
    }

    // For subscribed stocks, update aggregation for all periods
    // In production, you'd want to track which periods are active
    const periods = [Period.MIN_1, Period.MIN_5, Period.MIN_15, Period.MIN_30, Period.MIN_60];

    for (const period of periods) {
      try {
        this.aggregator.process(snapshot.stockCode, period, snapshot);
      } catch (error) {
        this.logger.error(`Aggregator error for ${period}: ${error}`);
      }
    }
  }

  private sendSubscription(): void {
    if (this.ws?.readyState !== WebSocket.OPEN || this.subscriptions.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'subscribe',
      stocks: Array.from(this.subscriptions),
    });

    this.ws.send(message);
  }

  private startHeartbeat(): void {
    // Send ping every 30 seconds
    const interval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        clearInterval(interval);
      }
    }, 30000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectTimeout = setTimeout(() => {
      this.logger.log('Reconnecting to TDX WebSocket...');
      this.reconnectTimeout = null;
      this.connect();
    }, this.reconnectDelay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Internal method: hook aggregator candle completion to callbacks
   * Called during initialization
   */
  initializeAggregatorCallback(): void {
    this.aggregator.on('candle', (candle: CompletedCandle) => {
      // Convert to TdxResponse format
      const tdxResponse: TdxResponse = {
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        amount: candle.amount,
      };

      // Find security for this stock code (simplified - in production, cache this)
      const security: Partial<Security> = {
        code: candle.stockCode.replace(/^SH|SZ/, ''),
      };

      for (const callback of this.candleCallbacks) {
        try {
          callback(tdxResponse, security as Security, candle.period);
        } catch (error) {
          this.logger.error(`Candle callback error: ${error}`);
        }
      }
    });
  }

  getConnectionStatus(): 'connected' | 'disconnected' | 'connecting' {
    if (!this.ws) return 'disconnected';
    if (this.ws.readyState === WebSocket.OPEN) return 'connected';
    if (this.ws.readyState === WebSocket.CONNECTING) return 'connecting';
    return 'disconnected';
  }
}
```

- [ ] **Step 2: Run tests to verify they pass**

Run:
```bash
cd apps/mist && npm test -- tdx-websocket.service.spec.ts
```

Expected: PASS all tests (may need to adjust tests for actual implementation)

- [ ] **Step 3: Fix any test failures and re-run**

If tests fail, update test expectations to match implementation.

- [ ] **Step 4: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/tdx-websocket.service.ts
git commit -m "feat(tdx): implement TdxWebSocketService

- Connect to mist-datasource WebSocket /ws/quote/{client_id}
- Subscribe/unsubscribe to stock quotes
- Parse quote messages into TdxSnapshot
- Aggregate snapshots into K-lines via KCandleAggregator
- Emit onSnapshot and onCandleComplete hooks
- Auto-reconnect with exponential backoff
- Application-level ping/pong heartbeat

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Update CollectorModule and CollectorService

**Files:**
- Modify: `apps/mist/src/collector/collector.module.ts`
- Modify: `apps/mist/src/collector/collector.service.ts`

### Subtask 8.1: Add KExtensionTdx to CollectorModule TypeORM registration

- [ ] **Step 1: Read current collector.module.ts**

Run:
```bash
cat apps/mist/src/collector/collector.module.ts
```

- [ ] **Step 2: Add KExtensionTdx to TypeOrmModule.forFeature**

Modify `apps/mist/src/collector/collector.module.ts`:

```typescript
// In the imports array, update TypeOrmModule.forFeature:
// FROM:
TypeOrmModule.forFeature([K, KExtensionEf, Security, SecuritySourceConfig])
// TO:
TypeOrmModule.forFeature([K, KExtensionEf, KExtensionTdx, Security, SecuritySourceConfig])

// Add KExtensionTdx to imports if not already present
import { KExtensionTdx } from '@app/shared-data';
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
cd apps/mist && npx tsc --noEmit --skipLibCheck 2>&1 | grep "collector.module" || echo "No errors"
```

Expected: No errors

- [ ] **Step 4: Commit**

Run:
```bash
git add apps/mist/src/collector/collector.module.ts
git commit -m "feat(collector): add KExtensionTdx to TypeORM registration

- TDX saveK requires KExtensionTdx repository
- Add to forFeature alongside KExtensionEf

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Subtask 8.2: Update CollectorService imports

- [ ] **Step 1: Read current collector.service.ts imports**

Run:
```bash
head -50 apps/mist/src/collector/collector.service.ts
```

- [ ] **Step 2: Update imports to new file paths**

Modify `apps/mist/src/collector/collector.service.ts`:

```typescript
// Update import paths:
// FROM:
import { EastMoneySource } from '../sources/east-money.source';
import { TdxSource } from '../sources/tdx.source';
// TO:
import { EastMoneySource } from '../sources/east-money/east-money-source.service';
import { TdxSource } from '../sources/tdx/tdx-source.service';
```

- [ ] **Step 3: Add SourceData type and update sources map**

Modify `apps/mist/src/collector/collector.service.ts`:

```typescript
// Add after imports (around line 10-20):
import { ISourceFetcher, KData } from '../sources/source-fetcher.interface';
import { TdxResponse } from '../sources/tdx/types';

// Define SourceData union type
type SourceData = KData | TdxResponse;

// In the class, update the sources map type (around line 25):
// FROM:
private sources: Map<DataSource, ISourceFetcher>;
// TO:
private sources: Map<DataSource, ISourceFetcher<SourceData>>;
```

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
cd apps/mist && npx tsc --noEmit --skipLibCheck 2>&1 | grep "collector.service" || echo "No errors"
```

Expected: No errors

- [ ] **Step 5: Run tests**

Run:
```bash
cd apps/mist && npm test -- collector.service.spec.ts
```

Expected: Tests pass (may need to update mock paths in tests)

- [ ] **Step 6: Commit**

Run:
```bash
git add apps/mist/src/collector/collector.service.ts
git add apps/mist/src/collector/collector.service.spec.ts
git commit -m "refactor(collector): update imports and add SourceData union type

- Update EastMoneySource and TdxSource import paths
- Add SourceData = KData | TdxResponse union type
- Update sources Map to use ISourceFetcher<SourceData>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Update WebSocketCollectionStrategy

**Files:**
- Modify: `apps/mist/src/collector/strategies/websocket-collection.strategy.ts`

### Subtask 9.1: Delegate to TdxWebSocketService

- [ ] **Step 1: Read current websocket-collection.strategy.ts**

Run:
```bash
cat apps/mist/src/collector/strategies/websocket-collection.strategy.ts
```

- [ ] **Step 2: Inject TdxWebSocketService and delegate start/stop**

Modify `apps/mist/src/collector/strategies/websocket-collection.strategy.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { IDataCollectionStrategy, DataSource, CollectionMode } from './data-collection.strategy.interface';
import { TdxWebSocketService } from '../../sources/tdx/tdx-websocket.service';

@Injectable()
export class WebSocketCollectionStrategy implements IDataCollectionStrategy {
  readonly source: DataSource = DataSource.TDX;
  readonly mode: CollectionMode = 'streaming';
  private readonly logger = new Logger(WebSocketCollectionStrategy.name);

  constructor(private readonly tdxWebSocketService: TdxWebSocketService) {}

  async start(): Promise<void> {
    this.logger.log('Starting TDX WebSocket streaming...');
    // TdxWebSocketService manages its own connection lifecycle via OnModuleInit
    // This is a no-op for now - could be used to trigger manual reconnection
  }

  async stop(): Promise<void> {
    this.logger.log('Stopping TDX WebSocket streaming...');
    // TdxWebSocketService manages its own disconnection via OnModuleDestroy
    // This is a no-op for now
  }

  // Other methods not applicable for streaming mode
  collectForSecurity(): Promise<number> {
    this.logger.warn('collectForSecurity not supported in streaming mode');
    return Promise.resolve(0);
  }

  collectScheduledCandle(): Promise<number> {
    this.logger.warn('collectScheduledCandle not supported in streaming mode');
    return Promise.resolve(0);
  }

  collectForAllSecurities(): Promise<number> {
    this.logger.warn('collectForAllSecurities not supported in streaming mode');
    return Promise.resolve(0);
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
cd apps/mist && npx tsc --noEmit --skipLibCheck 2>&1 | grep "websocket-collection" || echo "No errors"
```

Expected: No errors

- [ ] **Step 4: Run tests**

Run:
```bash
cd apps/mist && npm test -- websocket-collection.strategy.spec.ts
```

Expected: Tests pass (may need to update mocks)

- [ ] **Step 5: Commit**

Run:
```bash
git add apps/mist/src/collector/strategies/websocket-collection.strategy.ts
git commit -m "feat(collector): delegate WebSocketCollectionStrategy to TdxWebSocketService

- Inject TdxWebSocketService
- Implement start/stop as no-ops (lifecycle managed by OnModuleInit/Destroy)
- Maintain CollectionStrategyRegistry compatibility

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Update .env.example

**Files:**
- Modify: `apps/mist/.env.example`

### Subtask 10.1: Add TDX_BASE_URL to .env.example

- [ ] **Step 1: Read current .env.example**

Run:
```bash
cat apps/mist/.env.example | grep -E "DEFAULT_DATA_SOURCE|AKTOOLS"
```

- [ ] **Step 2: Add TDX_BASE_URL**

Modify `apps/mist/.env.example`:

```bash
# Add after AKTOOLS_BASE_URL line:

# TDX data source (mist-datasource service)
TDX_BASE_URL=http://127.0.0.1:9001
```

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/.env.example
git commit -m "docs: add TDX_BASE_URL to .env.example

- Document mist-datasource endpoint configuration
- Default http://127.0.0.1:9001 for local development

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 11: Full Integration Test

**Files:**
- Create: `apps/mist/src/sources/tdx/integration.spec.ts`

### Subtask 11.1: Create end-to-end integration test

- [ ] **Step 1: Create integration test file**

Create `apps/mist/src/sources/tdx/integration.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TdxSource } from './tdx-source.service';
import { DataSource, Period, Security } from '@app/shared-data';
import { describe, it, expect, jest } from '@jest/globals';

/**
 * Integration test for TDX source
 * Requires mist-datasource running in mock mode (APP_ENV=development)
 * Skip this test in CI if mist-datasource is not available
 */
describe.skip('TdxSource Integration', () => {
  let service: TdxSource;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TdxSource,
        {
          provide: 'CONFIG_SERVICE',
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'TDX_BASE_URL') return 'http://127.0.0.1:9001';
              return undefined;
            }),
          },
        },
        {
          provide: 'TYPEORM_DATA_SOURCE',
          useValue: {
            transaction: jest.fn(async (callback) => {
              const mockManager = {
                create: jest.fn((entity, data) => data),
                save: jest.fn((data) => Promise.resolve(data)),
              };
              return callback(mockManager);
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TdxSource>(TdxSource);
  });

  it('should fetch K-line data from mist-datasource mock', async () => {
    const mockSecurity: Partial<Security> = {
      id: 1,
      code: '600519',
      name: '贵州茅台',
      sourceConfigs: [
        {
          id: 1,
          securityId: 1,
          source: DataSource.TDX,
          formatCode: 'SH600519',
          priority: 1,
          enabled: true,
        },
      ],
    };

    const result = await service.fetchK({
      code: '600519',
      formatCode: 'SH600519',
      period: Period.DAY,
      startDate: new Date('2024-01-02'),
      endDate: new Date('2024-01-05'),
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty('timestamp');
    expect(result[0]).toHaveProperty('open');
    expect(result[0]).toHaveProperty('high');
    expect(result[0]).toHaveProperty('low');
    expect(result[0]).toHaveProperty('close');
    expect(result[0]).toHaveProperty('volume');
  }, 30000);

  it('should support TDX periods', () => {
    expect(service.isSupportedPeriod(Period.MIN_1)).toBe(true);
    expect(service.isSupportedPeriod(Period.MIN_5)).toBe(true);
    expect(service.isSupportedPeriod(Period.DAY)).toBe(true);
  });
});
```

- [ ] **Step 2: Document how to run integration tests**

Create `apps/mist/src/sources/tdx/README.md`:

```markdown
# TDX Data Source

## Development Setup

To run integration tests, start mist-datasource in mock mode:

```bash
cd /path/to/mist-datasource
export APP_ENV=development
uvicorn tdx.main:app --port 9001 --reload
```

Then run tests:

```bash
cd apps/mist
npm test -- tdx/integration.spec.ts
```

## mist-datasource API

- **REST**: `http://127.0.0.1:9001/api/tdx/*`
- **WebSocket**: `ws://127.0.0.1:9001/ws/quote/{client_id}`

See [mist-datasource docs](https://github.com/your-org/mist-datasource) for full API reference.
```

- [ ] **Step 3: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/integration.spec.ts apps/mist/src/sources/tdx/README.md
git commit -m "test(tdx): add integration test and README

- End-to-end test against mist-datasource mock mode
- Document development setup
- Skip in CI if mist-datasource unavailable

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 12: Add Backfill Support for WebSocket Reconnection

**Files:**
- Modify: `apps/mist/src/sources/tdx/tdx-websocket.service.ts`
- Modify: `apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts`

**Note**: This task adds data gap backfilling after WebSocket reconnection. When the connection drops and reconnects, we need to fetch any missed K-line data via REST API to ensure continuity.

### Subtask 12.1: Add backfill tests

- [ ] **Step 1: Add backfill test cases**

Add to `apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts`:

```typescript
describe('backfill after reconnection', () => {
  it('should trigger backfill when connection reestablished', async () => {
    const backfillCallback = jest.fn();
    service.onBackfill(backfillCallback);

    // Simulate connection drop and reconnect
    await service.onModuleInit();

    const closeCallback = mockWs.on.mock.calls.find((c: any[]) => c[0] === 'close')?.[1];
    const openCallback = mockWs.on.mock.calls.find((c: any[]) => c[0] === 'open')?.[1];

    openCallback?.(); // Initial connection
    closeCallback?.(); // Simulate disconnect
    openCallback?.(); // Reconnect

    // Wait for event loop
    await new Promise((resolve) => setImmediate(resolve));

    expect(backfillCallback).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/tdx-websocket.service.spec.ts
git commit -m "test(tdx): add backfill test cases for TdxWebSocketService

- Test backfill callback triggered on reconnection
- Ensure data continuity after connection drops

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Subtask 12.2: Implement backfill logic

- [ ] **Step 1: Add backfill state and callback to TdxWebSocketService**

Modify `apps/mist/src/sources/tdx/tdx-websocket.service.ts`:

```typescript
// Add new type:
type BackfillCallback = (stockCode: string, from: Date, to: Date) => void | Promise<void>;

// In class, add:
private backfillCallbacks: BackfillCallback[] = [];
private lastSnapshotTime = new Map<string, Date>();

onBackfill(callback: BackfillCallback): void {
  this.backfillCallbacks.push(callback);
}

// In handleMessage, update processSnapshot:
private processSnapshot(snapshot: TdxSnapshot): void {
  // Track last snapshot time for backfill
  this.lastSnapshotTime.set(snapshot.stockCode, snapshot.timestamp);

  // ... existing snapshot processing ...
}

// Update connection close handler:
this.ws.on('close', async () => {
  this.logger.warn('TDX WebSocket disconnected, triggering backfill...');
  await this.triggerBackfill();
  this.scheduleReconnect();
});

// Add backfill trigger method:
private async triggerBackfill(): Promise<void> {
  const now = new Date();

  for (const [stockCode, lastTime] of this.lastSnapshotTime) {
    const gapMinutes = Math.floor((now.getTime() - lastTime.getTime()) / 60000);

    if (gapMinutes > 0) {
      // Need to backfill from lastTime to now
      for (const callback of this.backfillCallbacks) {
        try {
          await callback(stockCode, lastTime, now);
        } catch (error) {
          this.logger.error(`Backfill callback error for ${stockCode}: ${error}`);
        }
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

Run:
```bash
git add apps/mist/src/sources/tdx/tdx-websocket.service.ts
git commit -m "feat(tdx): add backfill support for WebSocket reconnection

- Track last snapshot time per stock
- Trigger backfill callback on disconnect
- Calculate gap and request backfill from lastTime to now
- Ensures data continuity after connection drops

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 13: Final Verification and Cleanup

### Subtask 13.1: Run all tests

- [ ] **Step 1: Run all source-related tests**

Run:
```bash
cd apps/mist && npm test -- --testPathPattern="sources|collector" --verbose
```

Expected: All tests pass

- [ ] **Step 2: Run TypeScript check**

Run:
```bash
cd apps/mist && npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Fix any issues**

If there are failures, fix them and commit.

### Subtask 12.2: Remove duplicate type definitions

- [ ] **Step 1: Clean up source-fetcher.interface.ts**

Now that all imports use the new paths, remove the original extension type definitions from `source-fetcher.interface.ts` (keep only the base interfaces and KData, KFetchParams).

The types are now in:
- `east-money/types.ts` for EfExtension
- `tdx/types.ts` for TdxExtension

- [ ] **Step 2: Verify and commit**

Run:
```bash
cd apps/mist && npx tsc --noEmit
git add apps/mist/src/sources/source-fetcher.interface.ts
git commit -m "refactor: remove duplicate type definitions from source-fetcher.interface

- Extension types now in source-specific types.ts files
- Keep base ISourceFetcher, KData, KFetchParams

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

### Subtask 12.3: Update CLAUDE.md (if needed)

- [ ] **Step 1: Review CLAUDE.md for directory structure changes**

The sources/ directory structure has changed. Update if there are references to old file paths.

- [ ] **Step 2: Commit if needed**

---

## Summary

This plan implements the TDX data source integration in 13 tasks:

1. **Refactor directory structure** - Move files into subdirectories, add generics to interface
2. **Create East Money types** - Extract EfExtension, EfMinuteVo, EfDailyVo
3. **Create TDX types** - Define TdxResponse, TdxSnapshot, TdxExtension
4. **Create ITdxSourceFetcher interface** - Extend ISourceFetcher with TDX methods
5. **Implement KCandleAggregator** - Pure logic K-line aggregation
6. **Implement TdxSource** - HTTP REST client for mist-datasource
7. **Implement TdxWebSocketService** - WebSocket client with aggregation
8. **Update CollectorModule** - Add KExtensionTdx to TypeORM, update imports
9. **Update WebSocketCollectionStrategy** - Delegate to TdxWebSocketService
10. **Update .env.example** - Document TDX_BASE_URL
11. **Integration tests** - End-to-end test against mist-datasource mock
12. **Add backfill support** - Data gap backfilling after WebSocket reconnection
13. **Final verification** - Run all tests, cleanup

**Total estimated commits**: 25+
**Total estimated time**: 5-7 hours for implementation

## Out of Scope (Future Work)

The following items are explicitly out of scope for this implementation and should be tracked as follow-up tasks:

1. **NestJS WebSocket Gateway for frontend push**
   - The hooks `onSnapshot` and `onCandleComplete` in `TdxWebSocketService` provide the data
   - A separate NestJS WebSocket Gateway (`@WebSocketGateway()`) needs to be created to push this data to frontend clients
   - This involves creating a new gateway module, handling client connections, and routing data to subscribed clients
   - Recommend creating as separate task/PR after core TDX integration is stable

2. **TDX financial data, sector data, ETF data APIs**
   - mist-datasource provides `/api/tdx/financial/*`, `/api/tdx/sector/*`, `/api/tdx/etf/*` endpoints
   - Can be added incrementally as `TdxSource` methods
   - Requires understanding data models and use cases

3. **QMT (MiniQMT) data source integration**
   - Similar architecture to TDX, different mist-datasource instance (port 9002)
   - Stock code format differs (600000.SH vs SH600519)
   - Can follow same pattern after TDX is complete

import type { ChanK } from '@app/chancore';
import { VisualCommandService } from './visual-command.service';

function generateSampleKlines(count = 60): ChanK[] {
  const klines: ChanK[] = [];
  let price = 100;
  for (let i = 0; i < count; i++) {
    const isUp = i % 8 < 4;
    const delta = isUp ? 2.5 : -2.0;
    const open = price;
    const close = price + delta;
    const high = Math.max(open, close) + 1.0;
    const low = Math.min(open, close) - 1.0;
    price = close;

    klines.push({
      id: i + 1,
      symbol: '000001',
      time: new Date(Date.UTC(2026, 0, 1 + i, 9, 30)),
      open,
      high,
      low,
      close,
      volume: '10000',
      amount: '1000000',
    });
  }
  return klines;
}

describe('VisualCommandService', () => {
  let service: VisualCommandService;

  beforeEach(() => {
    service = new VisualCommandService();
  });

  it('generates standard VisualCommandPayload for given K-lines', () => {
    const klines = generateSampleKlines(60);
    const start = Date.now();
    const result = service.generateCommands({
      code: '000001',
      period: 5,
      source: 'qmt',
      klines,
      layers: ['chan'],
    });
    const duration = Date.now() - start;

    expect(result.code).toBe('000001');
    expect(result.period).toBe(5);
    expect(result.source).toBe('qmt');
    expect(result.totalKlines).toBe(60);
    expect(result.commands.length).toBeGreaterThan(0);
    // Performance requirement: < 50ms
    expect(duration).toBeLessThan(50);
  });

  it('filters commands according to requested layer subsets', () => {
    const klines = generateSampleKlines(60);
    const result = service.generateCommands({
      code: '000001',
      period: 5,
      source: 'tdx',
      klines,
      layers: ['chan_bi'],
    });

    expect(result.commands.every((c) => c.layer === 'chan_bi')).toBe(true);
  });
});

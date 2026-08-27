import type { ChanK } from '@app/chancore';
import { ChanVisualAdapter } from './chan-visual.adapter';

function generateSampleKlines(count = 50): ChanK[] {
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

describe('ChanVisualAdapter', () => {
  it('returns empty array when klines count is less than 3', () => {
    expect(ChanVisualAdapter.convert([])).toEqual([]);
    expect(ChanVisualAdapter.convert(generateSampleKlines(2))).toEqual([]);
  });

  it('converts sample K-lines into standard drawing commands (bi, duan, zhongshu, bsp)', () => {
    const klines = generateSampleKlines(60);
    const commands = ChanVisualAdapter.convert(klines);

    expect(commands.length).toBeGreaterThan(0);

    const biCommands = commands.filter((c) => c.layer === 'chan_bi');
    const zsBiCommands = commands.filter((c) => c.layer === 'chan_zs_bi');

    expect(biCommands.length).toBeGreaterThan(0);
    expect(biCommands[0]).toMatchObject({
      type: 'line',
      layer: 'chan_bi',
      color: '#FACC15',
    });

    if (zsBiCommands.length > 0) {
      expect(zsBiCommands[0]).toMatchObject({
        type: 'band',
        layer: 'chan_zs_bi',
        fill: true,
      });
    }
  });

  it('honors layer filtering options', () => {
    const klines = generateSampleKlines(60);
    const biOnly = ChanVisualAdapter.convert(klines, {
      includeBi: true,
      includeDuan: false,
      includeZhongshu: false,
      includeBsp: false,
    });

    expect(biOnly.every((c) => c.layer === 'chan_bi')).toBe(true);
  });
});

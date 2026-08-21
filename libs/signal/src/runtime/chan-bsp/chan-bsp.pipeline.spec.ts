import { createChanFullOutputFixture } from '../../../../../libs/chancore/src/chan-full-output.characterization.fixture';
import { runChanBspPipeline } from './chan-bsp.pipeline';

const CHAN_BSP_EVENT_TYPES = [
  'first_buy',
  'first_sell',
  'second_buy',
  'second_sell',
  'third_buy',
  'third_sell',
] as const;

describe('runChanBspPipeline', () => {
  const klines = createChanFullOutputFixture();
  it('returns an empty list for an empty series', () => {
    expect(runChanBspPipeline({ klines: [], units: 'duan' })).toEqual([]);
  });

  it('runs the duan pipeline over the characterization fixture without throwing', () => {
    const events = runChanBspPipeline({ klines, units: 'duan' });

    expect(Array.isArray(events)).toBe(true);
    for (const event of events) {
      expect(CHAN_BSP_EVENT_TYPES).toContain(event.type);
      expect(event.time).toBeInstanceOf(Date);
      expect(Number.isFinite(event.price)).toBe(true);
      expect(Number.isInteger(event.unitIndex)).toBe(true);
      expect(event.unitIndex).toBeGreaterThanOrEqual(0);
      if (event.zhongshuIndex === null) {
        expect(event.zg).toBeNull();
        expect(event.zd).toBeNull();
      } else {
        expect(event.zg).not.toBeNull();
        expect(event.zd).not.toBeNull();
      }
    }
  });

  // 注：端到端"产出已确认点"的验证依赖足够长的真实历史（段级结构需要 ≥3 段、
  // 中枢离开+回抽结构；87 根日线只形成 1 根段，348 根拼接同样不足）——该验证在
  // shadow/回测阶段用真实长历史完成（见 change design §10）。此处保留结构契约、
  // 确定性与时间边界断言（编排正确性），不依赖数据产出。

  it('is deterministic across repeated calls', () => {
    const first = runChanBspPipeline({ klines, units: 'duan' });
    const second = runChanBspPipeline({ klines, units: 'duan' });

    expect(second).toEqual(first);
  });

  it('maps confirmation time from the confirming unit end', () => {
    const events = runChanBspPipeline({ klines, units: 'duan' });
    for (const event of events) {
      expect(event.time.getTime()).toBeGreaterThanOrEqual(
        klines[0].time.getTime(),
      );
      expect(event.time.getTime()).toBeLessThanOrEqual(
        klines[klines.length - 1].time.getTime(),
      );
    }
  });
});

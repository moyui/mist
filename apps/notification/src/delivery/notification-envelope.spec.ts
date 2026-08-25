import {
  NotificationChannel,
  StrategyAlertEvent,
  StrategySignal,
} from '@app/shared-data';
import { buildNotificationEnvelope } from './notification-envelope';

const alertEvent = {
  id: 42,
  strategySignalId: 7,
  dedupeKey: 'live-v1:..',
} as StrategyAlertEvent;

describe('buildNotificationEnvelope', () => {
  it('builds a shanghai-time, chinese-direction summary with strategy + period', () => {
    const signal = {
      securityId: 9,
      strategyDefinitionId: 3,
      signalKind: 'entry',
      period: 1,
      signalTime: new Date('2026-08-13T01:30:00.000Z'), // 09:30 in UTC+8
      contextSnapshot: { triggerPrice: 19.87 },
    } as unknown as StrategySignal;
    const security = { code: '300059', name: '东方财富' } as unknown;
    const strategy = { name: '均线策略' } as unknown;

    const env = buildNotificationEnvelope(
      alertEvent,
      signal,
      security as any,
      strategy as any,
      NotificationChannel.WECHAT,
    );

    expect(env.message.securityCode).toBe('300059');
    expect(env.message.securityName).toBe('东方财富');
    expect(env.message.direction).toBe('买入');
    expect(env.message.strategyName).toBe('均线策略');
    expect(env.message.periodLabel).toBe('1m');
    expect(env.message.triggerPrice).toBe(19.87);
    // UTC 01:30 -> Shanghai 09:30
    expect(env.message.signalTime).toContain('2026-08-13');
    expect(env.message.signalTime).toContain('09:30');
    expect(env.message.summary).toContain('300059');
    expect(env.message.summary).toContain('东方财富');
    expect(env.message.summary).toContain('买入');
    expect(env.message.summary).toContain('19.87');
    expect(env.message.summary).toContain('均线策略');
  });

  it('maps exit -> 卖出 and day period -> 日线', () => {
    const signal = {
      securityId: 9,
      strategyDefinitionId: 3,
      signalKind: 'exit',
      period: 1440,
      signalTime: new Date('2026-08-13T01:30:00.000Z'),
      contextSnapshot: {},
    } as unknown as StrategySignal;

    const env = buildNotificationEnvelope(
      alertEvent,
      signal,
      null,
      null,
      NotificationChannel.QQ,
    );

    expect(env.message.direction).toBe('卖出');
    expect(env.message.periodLabel).toBe('日线');
    expect(env.channel).toBe(NotificationChannel.QQ);
  });

  it('falls back when signal/security/strategy are null', () => {
    const env = buildNotificationEnvelope(
      alertEvent,
      null,
      null,
      null,
      NotificationChannel.QQ,
    );
    expect(env.message.securityCode).toBe('7'); // strategySignalId fallback
    expect(env.message.securityName).toBe('');
    expect(env.message.direction).toBe('signal');
    expect(env.message.strategyName).toBe('');
    expect(env.message.periodLabel).toBe('');
    expect(env.message.triggerPrice).toBeUndefined();
  });

  it('ignores non-numeric triggerPrice in contextSnapshot', () => {
    const signal = {
      securityId: 9,
      strategyDefinitionId: 3,
      signalKind: 'entry',
      period: 1,
      signalTime: new Date(),
      contextSnapshot: { triggerPrice: 'not-a-number' },
    } as unknown as StrategySignal;

    const env = buildNotificationEnvelope(
      alertEvent,
      signal,
      null,
      null,
      NotificationChannel.WECHAT,
    );
    expect(env.message.triggerPrice).toBeUndefined();
  });

  it('renders chanBsp type and unit level into direction and summary', () => {
    const signal = {
      securityId: 1,
      strategyDefinitionId: 10,
      signalKind: 'entry',
      period: 5,
      signalTime: new Date('2026-08-26T01:35:00.000Z'), // 09:35 in UTC+8
      contextSnapshot: {
        triggerPrice: 3050.25,
        chanBsp: {
          type: 'first_buy',
          units: 'bi',
          level: 5,
          zhongshuIndex: 0,
          zg: 3060,
          zd: 3040,
        },
      },
    } as unknown as StrategySignal;
    const security = { code: '000001', name: '上证指数' } as unknown;
    const strategy = { name: '上证指数 5m 笔级缠论买卖点' } as unknown;

    const env = buildNotificationEnvelope(
      alertEvent,
      signal,
      security as any,
      strategy as any,
      NotificationChannel.WECHAT,
    );

    expect(env.message.securityCode).toBe('000001');
    expect(env.message.securityName).toBe('上证指数');
    expect(env.message.direction).toBe('一买 (笔级)');
    expect(env.message.strategyName).toBe('上证指数 5m 笔级缠论买卖点');
    expect(env.message.periodLabel).toBe('5m');
    expect(env.message.triggerPrice).toBe(3050.25);
    expect(env.message.summary).toBe(
      '[Mist] 000001 上证指数 一买 (笔级) @ 3050.25 | 上证指数 5m 笔级缠论买卖点 | 5m | 2026-08-26 09:35',
    );
  });

  it('renders duan-level chanBsp sell point into direction and summary', () => {
    const signal = {
      securityId: 2,
      strategyDefinitionId: 11,
      signalKind: 'exit',
      period: 30,
      signalTime: new Date('2026-08-26T06:00:00.000Z'), // 14:00 in UTC+8
      contextSnapshot: {
        triggerPrice: 1620.1,
        chanBsp: {
          type: 'third_sell',
          units: 'duan',
          level: 30,
          zhongshuIndex: 1,
          zg: 1650,
          zd: 1630,
        },
      },
    } as unknown as StrategySignal;
    const security = { code: '399006', name: '创业板指' } as unknown;
    const strategy = { name: '创业板指 30m 段级缠论买卖点' } as unknown;

    const env = buildNotificationEnvelope(
      alertEvent,
      signal,
      security as any,
      strategy as any,
      NotificationChannel.WECHAT,
    );

    expect(env.message.direction).toBe('三卖 (段级)');
    expect(env.message.summary).toBe(
      '[Mist] 399006 创业板指 三卖 (段级) @ 1620.1 | 创业板指 30m 段级缠论买卖点 | 30m | 2026-08-26 14:00',
    );
  });
});

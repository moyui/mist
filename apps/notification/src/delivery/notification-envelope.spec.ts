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
  it('builds summary from signal + security evidence', () => {
    const signal = {
      securityId: 9,
      signalKind: 'entry',
      signalTime: new Date('2026-08-12T09:35:00+08:00'),
      contextSnapshot: {
        triggerPrice: 12.5,
        triggerTime: '2026-08-12T01:35:00Z',
      },
    } as unknown as StrategySignal;
    const security = { code: '000001', name: '平安银行' } as any;

    const env = buildNotificationEnvelope(
      alertEvent,
      signal,
      security,
      NotificationChannel.WECHAT,
    );

    expect(env.alertEventId).toBe(42);
    expect(env.dedupeKey).toBe('live-v1:..');
    expect(env.channel).toBe(NotificationChannel.WECHAT);
    expect(env.message.securityCode).toBe('000001');
    expect(env.message.securityName).toBe('平安银行');
    expect(env.message.signalKind).toBe('entry');
    expect(env.message.triggerPrice).toBe(12.5);
    expect(env.message.summary).toContain('000001');
    expect(env.message.summary).toContain('平安银行');
    expect(env.message.summary).toContain('entry');
    expect(env.message.summary).toContain('12.5');
  });

  it('falls back when signal/security are null', () => {
    const env = buildNotificationEnvelope(
      alertEvent,
      null,
      null,
      NotificationChannel.QQ,
    );
    // securityCode falls back to strategySignalId (no security/signal)
    expect(env.message.securityCode).toBe('7');
    expect(env.message.securityName).toBe('');
    expect(env.message.signalKind).toBe('unknown');
    expect(env.message.triggerPrice).toBeUndefined();
    expect(env.message.summary).toContain('unknown');
  });

  it('ignores non-numeric triggerPrice in contextSnapshot', () => {
    const signal = {
      securityId: 9,
      signalKind: 'exit',
      signalTime: new Date(),
      contextSnapshot: { triggerPrice: 'not-a-number' },
    } as unknown as StrategySignal;
    const env = buildNotificationEnvelope(
      alertEvent,
      signal,
      null,
      NotificationChannel.WECHAT,
    );
    expect(env.message.triggerPrice).toBeUndefined();
  });
});

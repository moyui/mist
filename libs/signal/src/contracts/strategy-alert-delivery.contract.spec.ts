import { NotificationChannel } from '@app/shared-data';
import {
  alertDeliveryChannelJobId,
  alertDeliveryFanoutJobId,
  decodeAlertDeliveryChannelJobV1,
  decodeAlertDeliveryFanoutJobV1,
} from './strategy-alert-delivery.contract';

describe('strategy-alert-delivery contract', () => {
  describe('decodeAlertDeliveryFanoutJobV1', () => {
    it('accepts a valid V1 fanout job', () => {
      const decoded = decodeAlertDeliveryFanoutJobV1({
        contractVersion: 1,
        alertEventId: 5,
      });
      expect(decoded).toEqual({ contractVersion: 1, alertEventId: 5 });
    });

    it.each([
      ['extra key', { contractVersion: 1, alertEventId: 5, extra: 1 }],
      ['wrong version', { contractVersion: 2, alertEventId: 5 }],
      ['zero id', { contractVersion: 1, alertEventId: 0 }],
      ['non-integer', { contractVersion: 1, alertEventId: 1.5 }],
      ['missing', { contractVersion: 1 }],
    ])('rejects %s', (_label, bad) => {
      expect(() => decodeAlertDeliveryFanoutJobV1(bad)).toThrow(TypeError);
    });
  });

  describe('decodeAlertDeliveryChannelJobV1', () => {
    it('accepts a valid V1 channel job', () => {
      const decoded = decodeAlertDeliveryChannelJobV1({
        contractVersion: 1,
        alertEventId: 5,
        channel: NotificationChannel.WECHAT,
      });
      expect(decoded.channel).toBe(NotificationChannel.WECHAT);
    });

    it('rejects an unknown channel', () => {
      expect(() =>
        decodeAlertDeliveryChannelJobV1({
          contractVersion: 1,
          alertEventId: 5,
          channel: 'sms' as NotificationChannel,
        }),
      ).toThrow(/channel must be qq or wechat/);
    });
  });

  describe('jobId builders', () => {
    it('fanout jobId is deterministic per event', () => {
      const a = alertDeliveryFanoutJobId({
        contractVersion: 1,
        alertEventId: 7,
      });
      const b = alertDeliveryFanoutJobId({
        contractVersion: 1,
        alertEventId: 7,
      });
      expect(a).toBe(b);
      expect(a).toBe('deliver-fanout-v1-7');
    });

    it('channel jobId differs per channel', () => {
      const qq = alertDeliveryChannelJobId({
        contractVersion: 1,
        alertEventId: 7,
        channel: NotificationChannel.QQ,
      });
      const wechat = alertDeliveryChannelJobId({
        contractVersion: 1,
        alertEventId: 7,
        channel: NotificationChannel.WECHAT,
      });
      expect(qq).not.toBe(wechat);
      expect(qq).toBe('deliver-channel-v1-7-qq');
      expect(wechat).toBe('deliver-channel-v1-7-wechat');
    });
  });
});

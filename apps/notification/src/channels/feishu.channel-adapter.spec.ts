import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { FeishuChannelAdapter } from './feishu.channel-adapter';

type FetchMock = jest.Mock;

function configStub(values: Record<string, unknown>): ConfigService {
  return { get: jest.fn((k: string) => values[k]) } as unknown as ConfigService;
}

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

describe('FeishuChannelAdapter', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns permanent_failure when webhook is unconfigured', async () => {
    const adapter = new FeishuChannelAdapter(configStub({}));
    const res = await adapter.send({ text: 'hi' });
    expect(res.status).toBe('permanent_failure');
    expect(res.errorCode).toBe('FEISHU_WEBHOOK_MISSING');
  });

  it('sent when StatusCode 0 (Feishu success)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ StatusCode: 0 })) as FetchMock;
    global.fetch = fetchMock as unknown as typeof fetch;
    const adapter = new FeishuChannelAdapter(
      configStub({
        NOTIFICATION_FEISHU_WEBHOOK:
          'https://open.feishu.cn/open-apis/bot/v2/hook/token',
      }),
    );
    const res = await adapter.send({ text: 'hi' });
    expect(res.status).toBe('sent');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://open.feishu.cn/open-apis/bot/v2/hook/token',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.msg_type).toBe('text');
    expect(body.content.text).toBe('hi');
  });

  it('sent when code 0 (alternative field)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ code: 0 })) as unknown as typeof fetch;
    const adapter = new FeishuChannelAdapter(
      configStub({
        NOTIFICATION_FEISHU_WEBHOOK:
          'https://open.feishu.cn/open-apis/bot/v2/hook/token',
      }),
    );
    const res = await adapter.send({ text: 'hi' });
    expect(res.status).toBe('sent');
  });

  it('includes timestamp and sign when secret is configured (deterministic clock)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ StatusCode: 0 })) as FetchMock;
    global.fetch = fetchMock as unknown as typeof fetch;
    const clock = { nowSeconds: () => 1700000000 };
    const adapter = new FeishuChannelAdapter(
      configStub({
        NOTIFICATION_FEISHU_WEBHOOK:
          'https://open.feishu.cn/open-apis/bot/v2/hook/token',
        NOTIFICATION_FEISHU_SECRET: 's3cret',
      }),
      'NOTIFICATION_FEISHU_WEBHOOK',
      'NOTIFICATION_FEISHU_SECRET',
      clock as never,
    );
    const res = await adapter.send({ text: 'hi' });
    expect(res.status).toBe('sent');
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.timestamp).toBe('1700000000');
    // Feishu official algorithm: HMAC key = `${timestamp}\n${secret}`, empty message.
    const expectedSign = createHmac('sha256', '1700000000\ns3cret').digest(
      'base64',
    );
    expect(body.sign).toBe(expectedSign);
  });

  it('permanent_failure for invalid token code 19024', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ code: 19024, msg: 'invalid token' }),
      ) as unknown as typeof fetch;
    const adapter = new FeishuChannelAdapter(
      configStub({
        NOTIFICATION_FEISHU_WEBHOOK:
          'https://open.feishu.cn/open-apis/bot/v2/hook/token',
      }),
    );
    const res = await adapter.send({ text: 'hi' });
    expect(res.status).toBe('permanent_failure');
  });

  it('transient_failure for rate-limit code 19030', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ code: 19030, msg: 'rate limit' }),
      ) as unknown as typeof fetch;
    const adapter = new FeishuChannelAdapter(
      configStub({
        NOTIFICATION_FEISHU_WEBHOOK:
          'https://open.feishu.cn/open-apis/bot/v2/hook/token',
      }),
    );
    const res = await adapter.send({ text: 'hi' });
    expect(res.status).toBe('transient_failure');
  });

  it('transient_failure when fetch throws', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;
    const adapter = new FeishuChannelAdapter(
      configStub({
        NOTIFICATION_FEISHU_WEBHOOK:
          'https://open.feishu.cn/open-apis/bot/v2/hook/token',
      }),
    );
    const res = await adapter.send({ text: 'hi' });
    expect(res.status).toBe('transient_failure');
    expect(res.error).toContain('timeout');
  });
});

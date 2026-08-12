import { ConfigService } from '@nestjs/config';
import { WeComChannelAdapter } from './wechat.channel-adapter';

type FetchMock = jest.Mock;

function configStub(values: Record<string, unknown>): ConfigService {
  return { get: jest.fn((k: string) => values[k]) } as unknown as ConfigService;
}

function jsonResponse(body: unknown): Response {
  return { json: async () => body } as Response;
}

describe('WeComChannelAdapter', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns permanent_failure when webhook is unconfigured', async () => {
    const adapter = new WeComChannelAdapter(configStub({}));
    const res = await adapter.send({ message: { summary: 'x' } } as any);
    expect(res.status).toBe('permanent_failure');
  });

  it('sent when errcode 0', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ errcode: 0 })) as FetchMock;
    global.fetch = fetchMock as unknown as typeof fetch;
    const adapter = new WeComChannelAdapter(
      configStub({ NOTIFICATION_WECHAT_WEBHOOK: 'https://qyapi.example/hook' }),
    );
    const res = await adapter.send({ message: { summary: 'hi' } } as any);
    expect(res.status).toBe('sent');
    // webhook URL is the first arg, never logged in result
    expect(fetchMock).toHaveBeenCalledWith(
      'https://qyapi.example/hook',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('permanent_failure for invalid-webhook errcode 93000', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ errcode: 93000, errmsg: 'invalid' }),
      ) as unknown as typeof fetch;
    const adapter = new WeComChannelAdapter(
      configStub({ NOTIFICATION_WECHAT_WEBHOOK: 'https://qyapi.example/hook' }),
    );
    const res = await adapter.send({ message: { summary: 'hi' } } as any);
    expect(res.status).toBe('permanent_failure');
  });

  it('transient_failure for rate-limit errcode 45009', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ errcode: 45009, errmsg: 'rate limit' }),
      ) as unknown as typeof fetch;
    const adapter = new WeComChannelAdapter(
      configStub({ NOTIFICATION_WECHAT_WEBHOOK: 'https://qyapi.example/hook' }),
    );
    const res = await adapter.send({ message: { summary: 'hi' } } as any);
    expect(res.status).toBe('transient_failure');
  });

  it('transient_failure when fetch throws', async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;
    const adapter = new WeComChannelAdapter(
      configStub({ NOTIFICATION_WECHAT_WEBHOOK: 'https://qyapi.example/hook' }),
    );
    const res = await adapter.send({ message: { summary: 'hi' } } as any);
    expect(res.status).toBe('transient_failure');
    expect(res.error).toContain('timeout');
  });
});

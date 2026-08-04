import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InitializeRealtimeSubscriptionDto } from './initialize-realtime-subscription.dto';

async function errors(input: object) {
  return await validate(
    plainToInstance(InitializeRealtimeSubscriptionDto, input),
  );
}

describe('InitializeRealtimeSubscriptionDto', () => {
  it('accepts the exact new mode shape', async () => {
    await expect(
      errors({
        mode: 'new',
        securityCode: '600519',
        securityName: '贵州茅台',
        securityType: 'STOCK',
        source: 'qmt',
        providerSymbol: '600519.SH',
      }),
    ).resolves.toHaveLength(0);
  });

  it('accepts the exact existing mode shape', async () => {
    await expect(
      errors({ mode: 'existing', securitySourceConfigId: 17 }),
    ).resolves.toHaveLength(0);
  });

  it.each([
    {
      mode: 'new',
      securityCode: '600519',
      securityName: '贵州茅台',
      securityType: 'STOCK',
      source: 'mqmt',
      providerSymbol: '600519.SH',
    },
    {
      mode: 'new',
      securityCode: '600519',
      securityName: '贵州茅台',
      securityType: 'STOCK',
      source: 'tdx',
      providerSymbol: '600519.sh',
    },
    {
      mode: 'new',
      securityCode: '600519',
      securityName: '贵州茅台',
      securityType: 'STOCK',
      source: 'tdx',
      providerSymbol: '600519.SH',
      securitySourceConfigId: 17,
    },
    { mode: 'existing', securitySourceConfigId: 17, source: 'qmt' },
    { mode: 'existing', securitySourceConfigId: 0 },
  ])('rejects invalid or mixed initialization %#', async (input) => {
    expect(await errors(input)).not.toHaveLength(0);
  });
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RealtimeSubscriptionQueryDto } from './realtime-subscription-query.dto';

describe('RealtimeSubscriptionQueryDto', () => {
  it('defaults to a bounded page of 20', async () => {
    const dto = plainToInstance(RealtimeSubscriptionQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.limit).toBe(20);
  });

  it.each([
    { afterId: 0 },
    { afterId: -1 },
    { afterId: 'abc' },
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
  ])('rejects invalid cursor bounds %#', async (input) => {
    const dto = plainToInstance(RealtimeSubscriptionQueryDto, input);
    expect(await validate(dto)).not.toHaveLength(0);
  });
});

import { RuntimeConfigService } from './runtime-config.service';

describe('RuntimeConfigService', () => {
  const row = (value: string) => ({
    configKey: 'realtime_subscription_auto_reconcile',
    configValue: value,
  });

  it('starts with a conservative false cache', () => {
    const service = new RuntimeConfigService({ findOne: jest.fn() } as never);
    expect(service.getAutoReconcileCached()).toBe(false);
  });

  it('refresh picks up the DB switch value', async () => {
    const service = new RuntimeConfigService({
      findOne: jest.fn().mockResolvedValue(row('true')),
    } as never);

    await service.refresh();

    expect(service.getAutoReconcileCached()).toBe(true);
  });

  it('keeps the current cache when the DB row is missing (fail-safe)', async () => {
    const findOne = jest.fn().mockResolvedValue(null);
    const service = new RuntimeConfigService({ findOne } as never);
    await service.refresh();
    expect(service.getAutoReconcileCached()).toBe(false);

    // a later write creates the row
    findOne.mockResolvedValue(row('true'));
    await service.refresh();
    expect(service.getAutoReconcileCached()).toBe(true);
  });

  it('maps only the literal "true" value to enabled', async () => {
    const service = new RuntimeConfigService({
      findOne: jest.fn().mockResolvedValue(row('false')),
    } as never);
    await service.refresh();
    expect(service.getAutoReconcileCached()).toBe(false);
  });
});

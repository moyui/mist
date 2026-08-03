import { StrategyController } from './strategy.controller';

describe('StrategyController', () => {
  const createHarness = () => {
    const service = {
      create: jest.fn().mockResolvedValue({ id: 1 }),
      findAll: jest.fn().mockResolvedValue([{ id: 1 }]),
      findById: jest.fn().mockResolvedValue({ id: 1 }),
      enable: jest.fn().mockResolvedValue({ id: 1, status: 'enabled' }),
      disable: jest.fn().mockResolvedValue({ id: 1, status: 'disabled' }),
      listVersions: jest.fn().mockResolvedValue([{ id: 1 }]),
    };
    const controller = new StrategyController(service as any);

    return { controller, service };
  };

  it('delegates registry commands to the strategy definition service', async () => {
    const { controller, service } = createHarness();
    const createDto = {
      name: 'Strategy',
      targetUniverse: ['600519'],
      periods: [1440],
      sources: ['tdx'],
      rule: { field: 'k.close', operator: 'gt', value: 10 },
      signalKind: 'entry',
    } as any;

    await controller.create(createDto);
    await controller.findAll();
    await controller.findById('1');
    await controller.enable('1');
    await controller.disable('1');
    await controller.listVersions('1');

    expect(service.create).toHaveBeenCalledWith(createDto);
    expect(service.findAll).toHaveBeenCalled();
    expect(service.findById).toHaveBeenCalledWith(1);
    expect(service.enable).toHaveBeenCalledWith(1);
    expect(service.disable).toHaveBeenCalledWith(1);
    expect(service.listVersions).toHaveBeenCalledWith(1);
  });
});

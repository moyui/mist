import { HealthController } from './health.controller';

describe('HealthController (schedule)', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('should return health status', () => {
    const result = controller.getHealth();
    expect(result).toMatchObject({
      status: 'ok',
      service: 'schedule',
      instance: 'schedule',
    });
    expect(result.timestamp).toEqual(expect.any(String));
  });
});

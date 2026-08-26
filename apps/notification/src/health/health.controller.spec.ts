import { HealthController } from './health.controller';

describe('HealthController (notification)', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('should return health status', () => {
    const result = controller.getHealth();
    expect(result).toMatchObject({
      status: 'ok',
      service: 'notification',
      instance: 'notification',
    });
    expect(result.timestamp).toEqual(expect.any(String));
  });
});

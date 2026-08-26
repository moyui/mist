import { HealthController } from './health.controller';

describe('HealthController (chan)', () => {
  let controller: HealthController;

  beforeEach(() => {
    controller = new HealthController();
  });

  it('should return health status', () => {
    const result = controller.getHealth();
    expect(result).toMatchObject({
      status: 'ok',
      service: 'chan',
      instance: 'chan',
    });
    expect(result.timestamp).toEqual(expect.any(String));
  });
});

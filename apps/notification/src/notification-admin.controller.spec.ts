import { RequestMethod } from '@nestjs/common';
import { NotificationAdminController } from './notification-admin.controller';

describe('NotificationAdminController', () => {
  it('is mounted under /internal/notification (L3 network-boundary convention)', () => {
    expect(Reflect.getMetadata('path', NotificationAdminController)).toBe(
      'internal/notification',
    );
  });

  it('exposes replay as POST replay/:alertEventId', () => {
    const replayPath = Reflect.getMetadata(
      'path',
      NotificationAdminController.prototype.replay,
    );
    expect(replayPath).toBe('replay/:alertEventId');
    // Nest stores RequestMethod.POST (enum value 1) as method metadata.
    const httpMethod = Reflect.getMetadata(
      'method',
      NotificationAdminController.prototype.replay,
    );
    expect(httpMethod).toBe(RequestMethod.POST);
  });

  it('delegates to the replay service and reports the replayed count', async () => {
    const replayService = {
      replay: jest.fn().mockResolvedValue({
        replayed: 2,
      }),
    };
    const ctrl = new NotificationAdminController(replayService as never);

    const result = await ctrl.replay('42');

    expect(replayService.replay).toHaveBeenCalledWith(42);
    expect(result).toEqual({ alertEventId: 42, replayed: 2 });
  });
});

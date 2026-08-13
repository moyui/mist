import { Controller, Param, Post } from '@nestjs/common';
import { AlertReplayService } from './delivery/alert-replay.service';

export interface ReplayResponse {
  alertEventId: number;
  replayed: number;
}

/**
 * Operator-facing admin surface for the notification worker. Replay re-pushes a
 * failed/dead-lettered AlertEvent's deliveries without re-running strategy.
 *
 * Internal endpoint (remediate-alert-delivery-integrity L3): reachable only on
 * the compose network (no host port mapping) — the network boundary is the
 * access control, matching the /internal/ convention used by
 * /internal/oo-alert-receiver.
 */
@Controller('internal/notification')
export class NotificationAdminController {
  constructor(private readonly replayService: AlertReplayService) {}

  @Post('replay/:alertEventId')
  async replay(
    @Param('alertEventId') alertEventId: string,
  ): Promise<ReplayResponse> {
    const id = Number(alertEventId);
    const { replayed } = await this.replayService.replay(id);
    return { alertEventId: id, replayed };
  }
}

import { Controller, Param, Post } from '@nestjs/common';
import { AlertReplayService } from './delivery/alert-replay.service';

export interface ReplayResponse {
  alertEventId: number;
  replayed: number;
}

/**
 * Operator-facing admin surface for the notification worker. Replay re-pushes a
 * failed/dead-lettered AlertEvent's deliveries without re-running strategy.
 */
@Controller('v1/notification')
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

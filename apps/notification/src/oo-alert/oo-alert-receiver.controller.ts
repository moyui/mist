import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TimezoneService, isInTradingHours } from '@app/timezone';
import { OoAlertQueueService } from './oo-alert-queue.service';
import { SEVERITY_BY_PREFIX } from './oo-alert.constants';

interface OoAlertWebhookPayload {
  alertName?: unknown;
  ts?: unknown;
  [key: string]: unknown;
}

/**
 * OpenObserve alert webhook receiver. Token-authenticated; drops alerts that
 * fire outside trading sessions (OO rules run 24/7, "no growth" signals are
 * only meaningful during A-share sessions); enqueues accepted alerts to the
 * dedicated oo-alert-delivery queue.
 */
@Controller('internal/oo-alert-receiver')
export class OoAlertReceiverController {
  private readonly logger = new Logger(OoAlertReceiverController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly queue: OoAlertQueueService,
    private readonly timezone: TimezoneService,
  ) {}

  @Post()
  @HttpCode(202)
  async receive(
    @Headers('x-oo-alert-token') token: string | undefined,
    @Body() body: OoAlertWebhookPayload,
  ): Promise<{ accepted: boolean }> {
    const expected = this.config.get<string>('OO_ALERT_RECEIVER_TOKEN') ?? '';
    if (!expected || token !== expected) {
      throw new HttpException('unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const alertName =
      typeof body['alertName'] === 'string' ? body['alertName'] : '';
    if (!alertName) {
      this.logger.warn('oo alert payload missing alertName');
      return { accepted: false };
    }
    // Reject missing ts (L1): the OO template always renders
    // {alert_start_time} as ISO; absence means template-contract drift and
    // must surface, not be silently replaced with the current time.
    const ts = typeof body['ts'] === 'string' ? body['ts'] : '';
    if (!ts) {
      this.logger.warn(
        `oo alert payload missing ts alertName=${alertName} (template drift?)`,
      );
      return { accepted: false };
    }

    const now = new Date();
    const tradingSession =
      (await this.timezone.isTradingDay(now)) && isInTradingHours(now);
    if (!tradingSession) {
      this.logger.log(
        `oo alert dropped (outside trading session) alertName=${alertName}`,
      );
      return { accepted: false };
    }

    const prefix = alertName.slice(0, 2).toUpperCase();
    await this.queue.enqueueAlert({
      alertName,
      severity: SEVERITY_BY_PREFIX[prefix] ?? 'P2',
      ts,
      summary: JSON.stringify(body).slice(0, 512),
    });
    return { accepted: true };
  }
}

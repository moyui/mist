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
import type { OoAlertSeverity } from './oo-alert.constants';

interface OoAlertWebhookPayload {
  alertName?: unknown;
  ts?: unknown;
  [key: string]: unknown;
}

/** Rules file uses A1..A6 names; severity derives from the prefix. */
const SEVERITY_BY_PREFIX: Record<string, OoAlertSeverity> = {
  A1: 'P0',
  A2: 'P0',
  A3: 'P1',
  A4: 'P1',
  A5: 'P2',
  A6: 'P2',
};

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
    const ts =
      typeof body['ts'] === 'string' ? body['ts'] : new Date().toISOString();

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
    await this.queue.enqueue({
      alertName,
      severity: SEVERITY_BY_PREFIX[prefix] ?? 'P2',
      ts,
      summary: JSON.stringify(body).slice(0, 512),
    });
    return { accepted: true };
  }
}

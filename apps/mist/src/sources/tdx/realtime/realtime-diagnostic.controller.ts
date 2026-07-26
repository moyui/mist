/**
 * TdxRealtimeDiagnosticController — internal diagnostic readback.
 *
 * Mounted when TDX_REALTIME_MODE=builtin. NOT a product API.
 * Loopback/admin only: rejects non-loopback connections.
 * Returns typed snapshot, epoch, sequence, receivedAt, fresh/stale, drop
 * reasons, counters, owner, latest age, active symbols.
 */
import { Controller, Get, Param, NotFoundException, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { requireRealtimeDiagnosticLoopback } from '../../../realtime/realtime-diagnostic.guard';
import { TdxRealtimeStore } from './realtime.store';
import { TdxRealtimeAllowlistResolver } from './realtime-allowlist.resolver';
import { RealtimeSnapshotIngressService } from '../../../realtime/realtime-snapshot-ingress.service';

@ApiTags('tdx-realtime')
@Controller('internal/realtime/tdx')
export class TdxRealtimeDiagnosticController {
  constructor(
    private readonly store: TdxRealtimeStore,
    private readonly allowlist: TdxRealtimeAllowlistResolver,
    private readonly ingress: RealtimeSnapshotIngressService,
  ) {}

  @Get('status')
  getStatus(@Req() req: Request) {
    requireRealtimeDiagnosticLoopback(req);
    return {
      ...this.store.status(),
      allowlist: this.allowlist.entriesList.map((e) => ({
        formatCode: e.formatCode,
        securityId: e.securityId,
      })),
    };
  }

  @Get(':formatCode')
  getSymbol(@Param('formatCode') formatCode: string, @Req() req: Request) {
    requireRealtimeDiagnosticLoopback(req);
    const entry = this.allowlist.resolve(formatCode);
    const debug = entry ? this.ingress.read(entry.securityId) : null;
    if (!debug) {
      throw new NotFoundException(`no realtime snapshot for ${formatCode}`);
    }
    return debug;
  }
}

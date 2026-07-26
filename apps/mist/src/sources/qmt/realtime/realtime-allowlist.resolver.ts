import { DataSource } from '@app/shared-data';
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  RealtimeAllowlistEntry,
  RealtimeSecurityAllowlistService,
} from '../../../realtime/realtime-security-allowlist.service';

export type QmtRealtimeAllowlistEntry = RealtimeAllowlistEntry;

/** QMT-specific facade over the shared exact security identity boundary. */
@Injectable()
export class QmtRealtimeAllowlistResolver implements OnModuleInit {
  constructor(private readonly shared: RealtimeSecurityAllowlistService) {}

  async onModuleInit(): Promise<void> {
    await this.shared.initialize(DataSource.QMT, 'QMT_REALTIME_ALLOWLIST');
  }

  isAuthorized(formatCode: string): boolean {
    return this.shared.isAuthorized(DataSource.QMT, formatCode);
  }

  resolve(formatCode: string): QmtRealtimeAllowlistEntry | null {
    return this.shared.resolve(DataSource.QMT, formatCode);
  }

  get entriesList(): readonly QmtRealtimeAllowlistEntry[] {
    return this.shared.list(DataSource.QMT);
  }
}

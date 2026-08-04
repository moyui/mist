import { DataSource } from '@app/shared-data';
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  RealtimeAllowlistEntry,
  RealtimeSecurityAllowlistService,
} from '../../../realtime/realtime-security-allowlist.service';

export type AllowlistEntry = RealtimeAllowlistEntry;

/** TDX-specific facade over the shared exact security identity boundary. */
@Injectable()
export class TdxRealtimeAllowlistResolver implements OnModuleInit {
  constructor(private readonly shared: RealtimeSecurityAllowlistService) {}

  async onModuleInit(): Promise<void> {
    await this.shared.initialize(DataSource.TDX, 'TDX_REALTIME_ALLOWLIST');
  }

  resolve(formatCode: string): AllowlistEntry | null {
    return this.shared.resolve(DataSource.TDX, formatCode);
  }

  resolveEffective(formatCode: string): AllowlistEntry | null {
    return this.shared.resolveEffective(DataSource.TDX, formatCode);
  }

  isAuthorized(formatCode: string): boolean {
    return this.shared.isAuthorized(DataSource.TDX, formatCode);
  }

  get entriesList(): readonly AllowlistEntry[] {
    return this.shared.list(DataSource.TDX);
  }
}

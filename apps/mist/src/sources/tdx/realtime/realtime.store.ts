import { Injectable } from '@nestjs/common';

export type TdxRealtimeRejectReason =
  | 'decodeError'
  | 'contractMismatch'
  | 'validationError'
  | 'symbolNotAuthorized'
  | 'converterError'
  | 'controlResponseRejected';

@Injectable()
export class TdxRealtimeStore {
  private readonly rejectCounts = new Map<TdxRealtimeRejectReason, number>();
  private connectedValue = false;
  private transportReadyValue = false;
  private lastAcceptedAtValue: number | null = null;
  private lastCapturedAtValue: string | null = null;
  private lastRejectValue: {
    reason: TdxRealtimeRejectReason;
    providerSymbol: string | null;
    errorCode: string;
    at: number;
  } | null = null;
  private lastErrorValue: { code: string; message: string; at: number } | null =
    null;

  markConnected(): void {
    this.connectedValue = true;
    this.transportReadyValue = true;
  }

  markDisconnected(): void {
    this.connectedValue = false;
    this.transportReadyValue = false;
  }

  recordAccepted(capturedAt: string): void {
    this.lastAcceptedAtValue = Date.now();
    this.lastCapturedAtValue = capturedAt;
  }

  recordReject(
    reason: TdxRealtimeRejectReason,
    providerSymbol: string | null,
    errorCode: string,
  ): void {
    this.rejectCounts.set(reason, (this.rejectCounts.get(reason) ?? 0) + 1);
    this.lastRejectValue = {
      reason,
      providerSymbol,
      errorCode,
      at: Date.now(),
    };
  }

  setError(code: string, message: string): void {
    this.lastErrorValue = { code, message, at: Date.now() };
  }

  clearError(): void {
    this.lastErrorValue = null;
  }

  status() {
    return {
      mode: 'builtin' as const,
      schemaVersion: 2 as const,
      quality: 'latest-state' as const,
      connected: this.connectedValue,
      transportReady: this.transportReadyValue,
      lastAcceptedAt: this.lastAcceptedAtValue,
      lastCapturedAt: this.lastCapturedAtValue,
      rejectCounts: Object.fromEntries(this.rejectCounts),
      lastReject: this.lastRejectValue ? { ...this.lastRejectValue } : null,
      lastError: this.lastErrorValue ? { ...this.lastErrorValue } : null,
    };
  }
}

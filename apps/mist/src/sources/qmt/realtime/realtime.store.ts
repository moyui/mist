import { Injectable } from '@nestjs/common';

export type QmtRealtimeRejectReason =
  | 'decodeError'
  | 'contractMismatch'
  | 'validationError'
  | 'symbolNotAuthorized'
  | 'converterError'
  | 'controlResponseRejected';

@Injectable()
export class QmtRealtimeStore {
  private readonly rejectCounts = new Map<QmtRealtimeRejectReason, number>();
  private connectedValue = false;
  private transportReadyValue = false;
  private bridgeReadyValue = false;
  private ownerIdValue: string | null = null;
  private ownerGenerationValue: number | null = null;
  private bridgeBuildIdValue: string | null = null;
  private lastAcceptedAtValue: number | null = null;
  private lastCapturedAtValue: string | null = null;
  private lastRejectValue: {
    reason: QmtRealtimeRejectReason;
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

  setBridge(value: {
    ready: boolean;
    ownerId: string | null;
    ownerGeneration: number;
    bridgeBuildId: string | null;
  }): void {
    this.bridgeReadyValue = value.ready;
    this.ownerIdValue = value.ownerId;
    this.ownerGenerationValue = value.ownerGeneration;
    this.bridgeBuildIdValue = value.bridgeBuildId;
  }

  recordAccepted(capturedAt: string): void {
    this.lastAcceptedAtValue = Date.now();
    this.lastCapturedAtValue = capturedAt;
  }

  recordReject(
    reason: QmtRealtimeRejectReason,
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
      bridge: {
        ready: this.bridgeReadyValue,
        ownerId: this.ownerIdValue,
        ownerGeneration: this.ownerGenerationValue,
        bridgeBuildId: this.bridgeBuildIdValue,
      },
      lastAcceptedAt: this.lastAcceptedAtValue,
      lastCapturedAt: this.lastCapturedAtValue,
      rejectCounts: Object.fromEntries(this.rejectCounts),
      lastReject: this.lastRejectValue ? { ...this.lastRejectValue } : null,
      lastError: this.lastErrorValue ? { ...this.lastErrorValue } : null,
    };
  }
}

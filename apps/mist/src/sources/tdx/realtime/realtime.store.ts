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
  private readyValue = false;
  private ownerIdValue: string | null = null;
  private datasourceBuildIdValue: string | null = null;
  private bridgeBuildIdValue: string | null = null;
  private generationValue: number | null = null;
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
    this.readyValue = true;
  }

  markDisconnected(): void {
    this.connectedValue = false;
    this.readyValue = false;
  }

  setRuntimeMetadata(value: {
    ownerId?: string | null;
    datasourceBuildId?: string | null;
    bridgeBuildId?: string | null;
    generation?: number | null;
  }): void {
    if ('ownerId' in value) this.ownerIdValue = value.ownerId ?? null;
    if ('datasourceBuildId' in value)
      this.datasourceBuildIdValue = value.datasourceBuildId ?? null;
    if ('bridgeBuildId' in value)
      this.bridgeBuildIdValue = value.bridgeBuildId ?? null;
    if ('generation' in value) this.generationValue = value.generation ?? null;
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

  setRuntimeError(code: string, message: string): void {
    this.lastErrorValue = { code, message, at: Date.now() };
  }

  clearRuntimeError(): void {
    this.lastErrorValue = null;
  }

  status() {
    return {
      mode: 'builtin' as const,
      schemaVersion: 2 as const,
      quality: 'latest-state' as const,
      connected: this.connectedValue,
      ready: this.readyValue,
      ownerId: this.ownerIdValue,
      datasourceBuildId: this.datasourceBuildIdValue,
      bridgeBuildId: this.bridgeBuildIdValue,
      generation: this.generationValue,
      lastAcceptedAt: this.lastAcceptedAtValue,
      lastCapturedAt: this.lastCapturedAtValue,
      rejectCounts: Object.fromEntries(this.rejectCounts),
      lastReject: this.lastRejectValue ? { ...this.lastRejectValue } : null,
      lastError: this.lastErrorValue ? { ...this.lastErrorValue } : null,
    };
  }
}

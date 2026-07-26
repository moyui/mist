import { Injectable } from '@nestjs/common';
import { CanonicalRealtimeSnapshot } from './realtime-native-frame';

@Injectable()
export class RealtimeSnapshotIngressService {
  private readonly latest = new Map<string, CanonicalRealtimeSnapshot>();

  handleSnapshot(
    snapshot: CanonicalRealtimeSnapshot,
  ): CanonicalRealtimeSnapshot {
    this.latest.set(String(snapshot.securityId), snapshot);
    return snapshot;
  }

  read(securityId: number) {
    return this.latest.get(String(securityId)) ?? null;
  }
}

import { Injectable } from '@nestjs/common';
import { RealtimeSubscriptionControl } from '../realtime/realtime-subscription-control';
import { RealtimeSubscriptionSource } from './realtime-subscription.constants';

export interface RealtimeSubscriptionReadyObservation {
  source: RealtimeSubscriptionSource;
  connectionId: number;
  acceptedAt: Date;
}

export type RealtimeSubscriptionReadyListener = (
  observation: RealtimeSubscriptionReadyObservation,
) => void;
export type RealtimeSubscriptionDisconnectListener = (
  source: RealtimeSubscriptionSource,
) => void;

interface RuntimeSourceState {
  control: RealtimeSubscriptionControl;
  connectionId: number | null;
}

/**
 * Process-local provider-neutral bridge between transport clients and the
 * lifecycle owner. It carries only control capability and accepted-ready
 * connection identity; it never reads or stores business desired state.
 */
@Injectable()
export class RealtimeSubscriptionRuntimeRegistry {
  private readonly sources = new Map<
    RealtimeSubscriptionSource,
    RuntimeSourceState
  >();
  private readonly readyListeners =
    new Set<RealtimeSubscriptionReadyListener>();
  private readonly disconnectListeners =
    new Set<RealtimeSubscriptionDisconnectListener>();

  registerControl(
    source: RealtimeSubscriptionSource,
    control: RealtimeSubscriptionControl,
  ): void {
    this.sources.set(source, { control, connectionId: null });
  }

  unregisterControl(
    source: RealtimeSubscriptionSource,
    control: RealtimeSubscriptionControl,
  ): void {
    const current = this.sources.get(source);
    if (current?.control === control) this.sources.delete(source);
  }

  observeAcceptedReady(
    source: RealtimeSubscriptionSource,
    connectionId: number,
    acceptedAt = new Date(),
  ): void {
    const current = this.sources.get(source);
    if (!current || current.connectionId === connectionId) return;
    current.connectionId = connectionId;
    const observation = { source, connectionId, acceptedAt };
    for (const listener of this.readyListeners) listener(observation);
  }

  observeDisconnected(
    source: RealtimeSubscriptionSource,
    connectionId: number,
  ): void {
    const current = this.sources.get(source);
    if (current?.connectionId !== connectionId) return;
    current.connectionId = null;
    for (const listener of this.disconnectListeners) listener(source);
  }

  subscribeReady(listener: RealtimeSubscriptionReadyListener): () => void {
    this.readyListeners.add(listener);
    return () => this.readyListeners.delete(listener);
  }

  subscribeDisconnected(
    listener: RealtimeSubscriptionDisconnectListener,
  ): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  getReadyControl(
    source: RealtimeSubscriptionSource,
    connectionId?: number,
  ): RealtimeSubscriptionControl | null {
    const current = this.sources.get(source);
    if (
      !current ||
      current.connectionId === null ||
      (connectionId !== undefined && current.connectionId !== connectionId)
    ) {
      return null;
    }
    return current.control;
  }
}

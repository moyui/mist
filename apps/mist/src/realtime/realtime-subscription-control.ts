export type SubscriptionState = 'subscribed' | 'unknown';

export interface SubscriptionControlFailure {
  symbol: string | null;
  reason: string;
  subscriptionState?: SubscriptionState;
}

export type SubscriptionControlResult<T = unknown> =
  | { success: T }
  | { failure: SubscriptionControlFailure };

export interface RealtimeSubscriptionControl {
  syncSubscriptions(
    symbols: readonly string[],
  ): Promise<SubscriptionControlResult>;
  subscribe(symbol: string): Promise<SubscriptionControlResult>;
  unsubscribe(symbol: string): Promise<SubscriptionControlResult>;
  getSubscriptions(): Promise<SubscriptionControlResult>;
}

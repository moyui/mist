/**
 * Per-key serial Promise queue with bounded concurrency and overflow tracking.
 *
 * B1 design (lines 53-70) mandates a `Map<securityId, Promise<void>>` keyed
 * serial queue so that:
 *  - snapshots for the same security are processed strictly in order
 *    (transport acceptance order, not async I/O completion order);
 *  - different securities can wait on Redis I/O in parallel;
 *  - the finalizer (due scanner) enters the SAME keyed queue, so a finalize
 *    task never races a snapshot update for the same key;
 *  - a failed task does not break the chain for subsequent tasks.
 *
 * Overflow handling: when per-key or global pending limits are exceeded, the
 * task is NOT executed. The caller receives `false` from {@link enqueue} and
 * must mark the affected candle `queue_overflow` (design line 64). We never
 * silently coalesce snapshots.
 */
export interface KeyedQueueOptions {
  /** Max pending tasks per key before overflow. */
  maxPendingPerKey: number;
  /** Max pending tasks across all keys before overflow. */
  maxPendingGlobal: number;
}

export interface KeyedQueueStats {
  pendingGlobal: number;
  pendingByKey: Record<string, number>;
  overflowCount: number;
}

export class KeyedQueue {
  private readonly chains = new Map<string, Promise<void>>();
  private readonly pendingCount = new Map<string, number>();
  private globalPending = 0;
  private overflowCount = 0;
  private accepting = true;

  constructor(private readonly options: KeyedQueueOptions) {}

  /**
   * Enqueue a task for a key. Returns `false` if the task was rejected due to
   * overflow (per-key or global); the caller must handle the overflow case.
   *
   * A rejected task is never executed — it is simply dropped. This matches
   * design line 64: "overflow 禁止 snapshot coalescing; 受影响 candle 标记
   * queue_overflow 并丢弃".
   */
  enqueue(key: string, task: () => Promise<void>): boolean {
    if (!this.accepting) return false;

    const perKey = this.pendingCount.get(key) ?? 0;
    if (perKey >= this.options.maxPendingPerKey) {
      this.overflowCount++;
      return false;
    }
    if (this.globalPending >= this.options.maxPendingGlobal) {
      this.overflowCount++;
      return false;
    }

    this.pendingCount.set(key, perKey + 1);
    this.globalPending++;

    // Chain onto the existing promise for this key (serial), or start fresh.
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev
      .then(() => task())
      .catch(() => {
        // Swallow errors so the chain is not broken for subsequent tasks.
        // The task itself is responsible for logging/marking its own failure.
      })
      .finally(() => {
        const count = (this.pendingCount.get(key) ?? 1) - 1;
        if (count <= 0) {
          this.pendingCount.delete(key);
          this.chains.delete(key);
        } else {
          this.pendingCount.set(key, count);
        }
        this.globalPending--;
      });

    this.chains.set(key, next);
    return true;
  }

  /** Stop accepting new tasks (shutdown phase). */
  stopAccepting(): void {
    this.accepting = false;
  }

  /**
   * Wait for all in-flight tasks to settle. Used during shutdown drain.
   * Does not throw — individual task errors are swallowed in the chain.
   */
  async drain(): Promise<void> {
    const snapshots = [...this.chains.values()];
    await Promise.allSettled(snapshots);
  }

  /**
   * Snapshot of pending counts and overflow counter.
   * Not yet consumed by production code — reserved for a future observability
   * endpoint; tests use it to assert overflow behavior.
   */
  getStats(): KeyedQueueStats {
    const pendingByKey: Record<string, number> = {};
    for (const [k, v] of this.pendingCount) {
      pendingByKey[k] = v;
    }
    return {
      pendingGlobal: this.globalPending,
      pendingByKey,
      overflowCount: this.overflowCount,
    };
  }
}

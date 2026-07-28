import { KeyedQueue } from './keyed-queue';

describe('KeyedQueue', () => {
  const opts = { maxPendingPerKey: 2, maxPendingGlobal: 5 };

  it('runs tasks for the same key strictly in order (serial)', async () => {
    const q = new KeyedQueue(opts);
    const order: string[] = [];

    let release1!: () => void;
    const gate1 = new Promise<void>((r) => (release1 = r));

    q.enqueue('A', async () => {
      order.push('A1-start');
      await gate1;
      order.push('A1-end');
    });
    q.enqueue('A', async () => {
      order.push('A2');
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual(['A1-start']);

    release1();
    await q.drain();

    expect(order).toEqual(['A1-start', 'A1-end', 'A2']);
  });

  it('runs tasks for different keys in parallel', async () => {
    const q = new KeyedQueue(opts);
    const order: string[] = [];

    let releaseA!: () => void;
    let releaseB!: () => void;
    const gateA = new Promise<void>((r) => (releaseA = r));
    const gateB = new Promise<void>((r) => (releaseB = r));

    q.enqueue('A', async () => {
      order.push('A-start');
      await gateA;
      order.push('A-end');
    });
    q.enqueue('B', async () => {
      order.push('B-start');
      await gateB;
      order.push('B-end');
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(order).toContain('A-start');
    expect(order).toContain('B-start');

    releaseA();
    releaseB();
    await q.drain();
  });

  it('rejects tasks exceeding per-key limit and counts overflow', () => {
    const q = new KeyedQueue({ maxPendingPerKey: 1, maxPendingGlobal: 10 });
    q.enqueue('X', async () => new Promise(() => {}));

    const accepted = q.enqueue('X', async () => {});
    expect(accepted).toBe(false);
    expect(q.getStats().overflowCount).toBe(1);
  });

  it('rejects tasks exceeding global limit', () => {
    const q = new KeyedQueue({ maxPendingPerKey: 10, maxPendingGlobal: 1 });
    q.enqueue('k1', async () => new Promise(() => {}));
    const accepted = q.enqueue('k2', async () => {});
    expect(accepted).toBe(false);
    expect(q.getStats().overflowCount).toBe(1);
  });

  it('a failed task does not break the chain for subsequent tasks', async () => {
    const q = new KeyedQueue(opts);
    const results: string[] = [];

    q.enqueue('F', async () => {
      results.push('fail');
      throw new Error('boom');
    });
    q.enqueue('F', async () => {
      results.push('after-fail');
    });

    await q.drain();
    expect(results).toEqual(['fail', 'after-fail']);
  });

  it('drain waits for all in-flight tasks to settle', async () => {
    const q = new KeyedQueue(opts);
    let done = false;

    q.enqueue('D', async () => {
      await new Promise((r) => setTimeout(r, 30));
      done = true;
    });

    await q.drain();
    expect(done).toBe(true);
  });

  it('stopAccepting prevents new enqueues', () => {
    const q = new KeyedQueue(opts);
    q.stopAccepting();
    expect(q.enqueue('Z', async () => {})).toBe(false);
  });

  it('clears pending count after a key drains', async () => {
    const q = new KeyedQueue(opts);
    q.enqueue('C', async () => {});
    await q.drain();
    expect(q.getStats().pendingGlobal).toBe(0);
    expect(q.getStats().pendingByKey['C']).toBeUndefined();
  });
});

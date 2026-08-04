import { SignalRuntimeMutex } from './signal-runtime-mutex.service';

describe('SignalRuntimeMutex', () => {
  it('lets an in-flight job finish before registry cutover begins', async () => {
    const mutex = new SignalRuntimeMutex();
    const order: string[] = [];
    let releaseJob!: () => void;
    const jobGate = new Promise<void>((resolve) => {
      releaseJob = resolve;
    });
    const job = mutex.run(async () => {
      order.push('job:start');
      await jobGate;
      order.push('job:end');
    });
    const cutover = mutex.run(() => order.push('cutover'));

    await Promise.resolve();
    expect(order).toEqual(['job:start']);
    releaseJob();
    await Promise.all([job, cutover]);

    expect(order).toEqual(['job:start', 'job:end', 'cutover']);
  });

  it('continues after a failed operation without poisoning the tail', async () => {
    const mutex = new SignalRuntimeMutex();
    await expect(
      mutex.run(() => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    await expect(mutex.run(() => 'next')).resolves.toBe('next');
  });
});

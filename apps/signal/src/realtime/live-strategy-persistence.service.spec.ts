import { QueryFailedError } from 'typeorm';
import {
  LiveStrategyPersistenceService,
  isNamedAlertDedupeConflict,
  liveStrategyAlertDedupeKey,
} from './live-strategy-persistence.service';

describe('LiveStrategyPersistenceService', () => {
  it('writes Signal and PENDING AlertEvent in one transaction', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity, value) => value),
      save: jest
        .fn()
        .mockResolvedValueOnce({ id: 77 })
        .mockResolvedValueOnce({ id: 88 }),
    };
    const dataSource = {
      transaction: jest.fn((operation) => operation(manager)),
    };
    const service = new LiveStrategyPersistenceService(dataSource as never);

    await expect(service.persist(candidate())).resolves.toBe('created');

    expect(manager.query).toHaveBeenCalledWith(
      'SET SESSION innodb_lock_wait_timeout = 3',
    );
    expect(manager.create.mock.calls[0]?.[1]).toMatchObject({
      strategyDefinitionId: 3,
      strategyVersionId: 7,
      securityId: 9,
      signalTime: new Date('2026-08-04T06:44:00.000Z'),
      contextSnapshot: {
        k: { type: 'incomplete', close: 28 },
        triggerTime: '2026-08-04T06:44:00.000Z',
        triggerPrice: 28,
      },
    });
    expect(manager.create.mock.calls[1]?.[1]).toMatchObject({
      strategySignalId: 77,
      status: 'pending',
      dedupeKey: 'live-v1:3:7:9:tdx:5:entry:1785825840000',
    });
  });

  it('classifies only the exact named AlertEvent unique conflict', async () => {
    const exact = duplicateError(
      "Duplicate entry 'x' for key 'strategy_alert_events.uq_strategy_alert_events_dedupe_key'",
    );
    const service = new LiveStrategyPersistenceService({
      transaction: jest.fn().mockRejectedValue(exact),
    } as never);

    await expect(service.persist(candidate())).resolves.toBe(
      'duplicate_skipped',
    );
    expect(isNamedAlertDedupeConflict(exact)).toBe(true);
    expect(
      isNamedAlertDedupeConflict(
        duplicateError("Duplicate entry 'x' for key 'some_other_unique'"),
      ),
    ).toBe(false);
    expect(
      isNamedAlertDedupeConflict(
        duplicateError('Duplicate entry without a named key'),
      ),
    ).toBe(false);
  });

  it('propagates an AlertEvent write failure without readback or retry', async () => {
    const failure = new Error('alert insert failed');
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity, value) => value),
      save: jest
        .fn()
        .mockResolvedValueOnce({ id: 77 })
        .mockRejectedValueOnce(failure),
    };
    const dataSource = {
      transaction: jest.fn((operation) => operation(manager)),
    };
    const service = new LiveStrategyPersistenceService(dataSource as never);

    await expect(service.persist(candidate())).rejects.toBe(failure);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(2);
  });

  it('builds identity only from the approved result fields', () => {
    expect(liveStrategyAlertDedupeKey(candidate())).toBe(
      'live-v1:3:7:9:tdx:5:entry:1785825840000',
    );
  });
});

function candidate() {
  return {
    definitionId: 3,
    versionId: 7,
    securityId: 9,
    source: 'tdx' as const,
    period: 5,
    signalKind: 'entry' as const,
    signalTime: new Date('2026-08-04T06:44:00.000Z'),
    triggerTime: '2026-08-04T06:44:00.000Z',
    triggerPrice: 28,
    barType: 'incomplete' as const,
    evaluation: {
      status: 'evaluated' as const,
      matched: true,
      context: {} as never,
    },
    contextSnapshot: { k: { type: 'incomplete', close: 28 } },
    ruleSnapshot: { field: 'k.close', operator: 'gt', value: 27 },
  };
}

function duplicateError(sqlMessage: string): QueryFailedError {
  const driver = Object.assign(new Error(sqlMessage), {
    code: 'ER_DUP_ENTRY',
    errno: 1062,
    sqlMessage,
  });
  return new QueryFailedError('INSERT', [], driver);
}

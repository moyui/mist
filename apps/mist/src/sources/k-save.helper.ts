import { Decimal8 } from '@app/decimal';
import { DataSource, K, Period, Security } from '@app/shared-data';
import { EntityManager, In } from 'typeorm';

export const K_UPSERT_COLUMNS = [
  'open',
  'high',
  'low',
  'close',
  'volume',
  'amount',
];
// TypeORM .orUpdate() conflict target expects DATABASE column names.
export const K_CONFLICT_COLUMNS = [
  'security_id',
  'source',
  'period',
  'timestamp',
];

export interface BaseKInput {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: string | null;
  amount: string | null;
}

const REQUIRED_PRICE_FIELDS = ['open', 'high', 'low', 'close'] as const;

function assertFiniteRequiredPrices(data: BaseKInput[]): void {
  data.forEach((row, index) => {
    const invalidFields = REQUIRED_PRICE_FIELDS.filter(
      (field) => !Number.isFinite(row[field]),
    );
    if (invalidFields.length === 0) {
      return;
    }

    const timestamp =
      row.timestamp instanceof Date && Number.isFinite(row.timestamp.getTime())
        ? row.timestamp.toISOString()
        : String(row.timestamp);
    throw new TypeError(
      `Invalid required K prices at row ${index} (timestamp=${timestamp}): ${invalidFields.join(', ')} must be finite numbers`,
    );
  });
}

export async function saveBaseK(
  manager: EntityManager,
  data: BaseKInput[],
  security: Security,
  source: DataSource,
  period: Period,
): Promise<Map<number, K>> {
  assertFiniteRequiredPrices(data);

  const kEntities = data.map((d) =>
    manager.create(K, {
      security,
      securityId: security.id,
      source,
      period,
      timestamp: d.timestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
      volume: assertCanonicalQuantity(d.volume),
      amount: assertCanonicalQuantity(d.amount),
    }),
  );
  const kValues = kEntities.map((k) => ({
    securityId: k.securityId,
    source: k.source,
    period: k.period,
    timestamp: k.timestamp,
    open: k.open,
    high: k.high,
    low: k.low,
    close: k.close,
    volume: k.volume,
    amount: k.amount,
  }));

  await manager
    .createQueryBuilder()
    .insert()
    .into(K)
    .values(kValues)
    .orUpdate(K_UPSERT_COLUMNS, K_CONFLICT_COLUMNS)
    .updateEntity(false)
    .execute();

  const savedKs = await manager.find(K, {
    where: {
      security: { id: security.id },
      source,
      period,
      timestamp: In(data.map((d) => d.timestamp)),
    },
  });

  return new Map(savedKs.map((k) => [k.timestamp.getTime(), k]));
}

function assertCanonicalQuantity(value: string | null): string | null {
  if (value === null) return null;
  return Decimal8.parseCanonical(value).formatCanonical();
}

import { getMetadataArgsStorage } from 'typeorm';
import { RealtimeSubscriptionAssignment } from './realtime-subscription-assignment.entity';
import { SecuritySourceConfig } from './security-source-config.entity';

describe('RealtimeSubscriptionAssignment metadata', () => {
  const storage = getMetadataArgsStorage();

  it('uses the exact managed table and physical columns', () => {
    expect(
      storage.tables.find(
        (table) => table.target === RealtimeSubscriptionAssignment,
      )?.name,
    ).toBe('realtime_subscription_assignments');

    expect(
      storage.columns
        .filter((column) => column.target === RealtimeSubscriptionAssignment)
        .map((column) => [column.propertyName, column.options.name]),
    ).toEqual(
      expect.arrayContaining([
        ['securityId', 'security_id'],
        ['sourceConfigId', 'source_config_id'],
        ['createdAt', 'created_at'],
        ['updatedAt', 'updated_at'],
      ]),
    );
  });

  it('declares the exact unique and lookup indexes', () => {
    const indexes = storage.indices.filter(
      (index) => index.target === RealtimeSubscriptionAssignment,
    );
    expect(
      indexes.map((index) => [index.name, index.columns, index.unique]),
    ).toEqual(
      expect.arrayContaining([
        ['uq_realtime_subscription_assignments_security', ['securityId'], true],
        [
          'uq_realtime_subscription_assignments_source_config',
          ['sourceConfigId'],
          true,
        ],
        [
          'idx_realtime_subscription_assignments_source_security',
          ['sourceConfigId', 'securityId'],
          false,
        ],
      ]),
    );

    expect(
      storage.indices.find(
        (index) =>
          index.target === SecuritySourceConfig &&
          index.name === 'uq_security_source_configs_id_security',
      ),
    ).toMatchObject({ columns: ['id', 'securityId'], unique: true });
    expect(
      storage.indices.find(
        (index) =>
          index.target === SecuritySourceConfig &&
          index.name === 'idx_security_source_configs_source',
      ),
    ).toMatchObject({ columns: ['source'], unique: false });
  });

  it('pins both restrictive named foreign keys', () => {
    const relations = storage.relations.filter(
      (relation) => relation.target === RealtimeSubscriptionAssignment,
    );
    expect(
      relations.map((relation) => [
        relation.propertyName,
        relation.options.onDelete,
        relation.options.onUpdate,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ['security', 'RESTRICT', 'RESTRICT'],
        ['sourceConfig', 'RESTRICT', 'RESTRICT'],
      ]),
    );

    const joins = storage.joinColumns.filter(
      (join) => join.target === RealtimeSubscriptionAssignment,
    );
    expect(
      joins.map((join) => [
        join.propertyName,
        join.name,
        join.referencedColumnName,
        join.foreignKeyConstraintName,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [
          'security',
          'security_id',
          'id',
          'fk_realtime_subscription_assignments_security',
        ],
        [
          'sourceConfig',
          'source_config_id',
          'id',
          'fk_realtime_subscription_assignments_source_config',
        ],
        [
          'sourceConfig',
          'security_id',
          'securityId',
          'fk_realtime_subscription_assignments_source_config',
        ],
      ]),
    );
  });

  it('contains routing only and no desired state', () => {
    expect(
      storage.columns.some(
        (column) =>
          column.target === RealtimeSubscriptionAssignment &&
          /desired/i.test(column.propertyName),
      ),
    ).toBe(false);
  });
});

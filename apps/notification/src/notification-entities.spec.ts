import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { NOTIFICATION_ENTITIES } from './notification-entities';

/**
 * Validates the notification app's TypeORM entity graph WITHOUT a database or app
 * boot. TypeORM throws `Entity metadata for X#relation was not found` at
 * buildMetadatas when an entity references a relation target that is not registered
 * (e.g. Security -> SecuritySourceConfig). This catches that class of boot bug in
 * unit tests instead of at deploy time.
 */
describe('notification TypeORM entity graph', () => {
  it('builds metadata with no missing-relation errors (full graph registered)', async () => {
    const dataSource = new DataSource({
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      username: 'audit',
      password: 'audit',
      database: 'mist',
      entities: NOTIFICATION_ENTITIES,
      synchronize: false,
    });
    await expect(
      (
        dataSource as unknown as { buildMetadatas: () => Promise<unknown> }
      ).buildMetadatas(),
    ).resolves.not.toThrow();
  });

  it('registers the delivery entity (migration 018 backing store)', () => {
    const names = NOTIFICATION_ENTITIES.map((e) => e.name);
    expect(names).toContain('StrategyAlertDelivery');
    expect(names).toContain('StrategyAlertEvent');
    expect(names).toContain('Security');
    // Security's relation targets must be present (the original boot bug).
    expect(names).toContain('SecuritySourceConfig');
    expect(names).toContain('K');
  });
});

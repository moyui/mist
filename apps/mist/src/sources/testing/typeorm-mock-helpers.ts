/**
 * Shared TypeORM mock factories for source-service specs.
 *
 * These builders were previously duplicated verbatim across the
 * `qmt/`, `tdx/`, and `east-money/` source-service spec files. Keep them
 * here so a change to the InsertBuilder chain shape lands in one place.
 */

/**
 * Mock for a TypeORM `InsertQueryBuilder` fluent chain ending in `execute()`.
 * Every chainable method returns `this`, and `execute()` resolves to void.
 */
export const createInsertBuilderMock = () => ({
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orUpdate: jest.fn().mockReturnThis(),
  updateEntity: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue(undefined),
});

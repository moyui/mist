# Unify Security Type Refactoring Design

**Date:** 2026-03-26
**Author:** Claude
**Status:** Approved

## Overview

This refactoring eliminates the duplicate `StockType` enum in the DTO layer by standardizing on the canonical `SecurityType` enum from the shared library. This removes unnecessary conversion logic and establishes a single source of truth for security types throughout the codebase.

## Problem Statement

The codebase currently has two enums for the same concept:
1. `StockType` in `apps/mist/src/security/dto/init-stock.dto.ts` with lowercase values (`'index'`, `'stock'`)
2. `SecurityType` in `libs/shared-data/src/enums/security-type.enum.ts` with uppercase values (`'INDEX'`, `'STOCK'`)

This duplication causes:
- Confusion about which enum to use
- Unnecessary `convertStockType()` method in `SecurityService`
- Inconsistent naming (`StockType` vs `SecurityType`)

## Solution

Replace all usages of `StockType` with `SecurityType` from the shared library.

## Changes

### 1. DTO Layer (`init-stock.dto.ts`)
- Remove the `StockType` enum definition
- Import `SecurityType` from `@app/shared-data`
- Update `InitStockDto.type` to use `SecurityType`

### 2. Service Layer (`security.service.ts`)
- Remove `StockType` from imports
- Remove the `convertStockType()` method
- Use `SecurityType` directly in `initStock()`

### 3. Test Files
- `security.controller.spec.ts` - Replace `StockType` with `SecurityType`
- `security.service.spec.ts` - Replace `StockType` with `SecurityType`
- Update test data to use uppercase enum values

### 4. Documentation
- Update plan documents that reference the old `StockType`

## Impact

### Breaking Changes
- API consumers must now send uppercase values: `"INDEX"` or `"STOCK"` instead of `"index"` or `"stock"`

### Benefits
- Removes unnecessary conversion logic
- Single source of truth for security types
- Consistent naming throughout the codebase
- Simplified maintenance

## Testing Strategy

1. Run unit tests for `security.service.spec.ts`
2. Run unit tests for `security.controller.spec.ts`
3. Verify API contracts with uppercase enum values
4. Ensure no regressions in data collection functionality

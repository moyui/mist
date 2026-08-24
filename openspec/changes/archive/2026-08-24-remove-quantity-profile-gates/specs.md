# Specs Delta: remove-quantity-profile-gates

## Modified Requirements

### strategy-evaluation-contract/spec.md

**Requirement: A quantity rule targets an unsupported security profile**

Before:
```
WHEN a definition references `k.volume` or `k.amount` for a source/runtime
  whose unit profile has not passed its required HIL
THEN validation, load, enable or realtime registration MUST reject the target
  or mark it ineligible
```

After:
```
WHEN a definition references `k.volume` or `k.amount`
THEN validation, load, enable and realtime registration MAY proceed
  IF the source adapter provides canonical StrategyBar values in shares
  and CNY yuan before evaluation
```

Rationale: HIL approval is now complete (migration 019/022, write-layer canonicalization, QMT data recovery). The gate was a temporary safety measure; removing it allows production use of quantity fields in strategies.

### strategy-market-context/spec.md

**Requirement: A quantity profile is not proven**

Before:
```
WHEN the source/runtime, security type or historical/realtime seam lacks
  accepted quantity-unit evidence
THEN an execution plan consuming k.volume or k.amount MUST remain
  realtime-ineligible
```

After:
```
WHEN the source adapter provides canonical StrategyBar values in shares
  and CNY yuan
THEN an execution plan consuming k.volume or k.amount MAY proceed
  under its own readiness gates
```

## No Changes Required

- `realtime-market-data-ingress/spec.md` — transport acceptance memory-only constraint unchanged
- `backend-datasource-integration/spec.md` — quantity profile acceptance unchanged (applies to realtime product path, not gate)

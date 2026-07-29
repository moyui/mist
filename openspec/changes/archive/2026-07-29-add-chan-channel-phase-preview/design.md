## Context

Bi calculation already exposes Phase A candidates and a Phase B fixed-point
reduction. Channel calculation was being changed to mirror that shape, but its
validity predicate repeated the initial `zg > zd` detection rule, which made
every Phase A channel Valid and prevented Phase B from ever reducing a span.
The frontend also has both live API consumers and checked-in real snapshots, so
the response migration must tolerate either deployment order.

## Goals / Non-Goals

**Goals:**
- Make Channel Phase A useful for inspection and Phase B a real reduction.
- Preserve a stable legacy-to-canonical normalization boundary in the frontend.
- Keep backend CI self-contained while retaining real snapshot evidence in the
  frontend repository.
- Document the two-phase response accurately in generated OpenAPI metadata.

**Non-Goals:**
- Change Bi Phase A or Phase B semantics.
- Render Phase A and Phase B channels simultaneously on the production chart.
- Introduce a cross-repository checkout dependency in backend unit tests.

## Decisions

### Restore the established channel validity rules

Initial detection continues to require alternating Bis, `zg > zd`, and overlap.
Phase A then stamps each detected candidate Valid only when the original
internal-range and endpoint-extreme rules also pass; otherwise it retains the
candidate as Invalid. This preserves rejected structure for inspection without
weakening the final business result.

### Reuse the fixed-point span reducer with channel predicates

Channel Phase B uses the same shortest-span, leftmost-first driver as Bi, with
channel-specific predicates. A span can reduce only when all entries are
complete, endpoints have the same trend, at least one entry is Invalid, endpoint
time ranges overlap, the combined zone remains valid, and middle channels fit
the endpoint envelope. Merged output is revalidated after every replacement.
Residual Invalid channels are omitted from the public Phase B result.

### Normalize compatibility at the frontend boundary

The backend returns the standard API envelope whose `data` is the canonical
`{ phaseA, phaseB }` object. After envelope unwrapping, frontend API and snapshot
loaders accept either that object or a legacy array; an array is mapped to both
phases. Live and snapshot charts render Phase B by default, so backend and
frontend can be deployed in either order.

### Separate synthetic unit coverage from real display fixtures

Backend tests construct deterministic synthetic Bis and channels and never read
another repository. The four real TDX snapshot sets remain in `mist-fe`, where
the generator writes canonical channel objects and phase-specific counts.

## Risks / Trade-offs

- [The stricter validity rules reduce displayed channels] -> Regenerate all four
  frontend fixtures and review phase counts and representative output before
  commit.
- [A legacy frontend cannot consume the new object] -> Push backend and frontend
  changes together and keep frontend legacy-array normalization.
- [Span reduction joins unrelated time ranges] -> Require endpoint channel time
  overlap in addition to price-zone compatibility.
- [Synthetic tests miss market-specific behavior] -> Keep generated real
  snapshots as review artifacts without making backend CI cross-repository.

## Migration Plan

1. Land the backend canonical response and synthetic contract coverage.
2. Land frontend union normalization and Phase B selection.
3. Regenerate and commit channel snapshots and phase counts.
4. Roll back both repositories together if chart or fixture verification fails;
   the frontend legacy-array path remains available during rollback.

## Open Questions

None. The validity, reduction, compatibility, and fixture boundaries are fixed
by this change.

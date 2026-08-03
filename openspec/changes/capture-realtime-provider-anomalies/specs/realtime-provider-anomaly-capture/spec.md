## ADDED Requirements

### Requirement: Provider anomalies are observed rather than manufactured

Production anomaly evidence SHALL originate from a naturally occurring TDX or
QMT terminal/runtime condition. Acceptance tooling MUST NOT add or activate a
fault-injection path in a production bridge, datasource route, realtime wire,
Mist client or operator mutation tool merely to exercise a negative branch.

#### Scenario: A negative branch has not occurred
- **WHEN** no real provider anomaly has been observed
- **THEN** evidence MUST record the branch as `not-observed`
- **AND** tooling MUST NOT disconnect networking, falsify a native list,
  corrupt journal state, replace a lease or suppress a native call to create it

#### Scenario: A deterministic test covers the branch
- **WHEN** unit, contract or integration tests prove the branch behavior
- **THEN** the result MUST remain labelled deterministic evidence
- **AND** it MUST NOT be relabelled as live terminal/runtime evidence

### Requirement: A real anomaly produces one sanitized incident bundle

After a real anomaly is observed, the operator SHALL capture one bounded
incident bundle containing the observation window, source, artifact identities,
current readiness, provider-specific postcondition, recovery action and final
state. The bundle MUST distinguish observed facts from inference and unknown
state.

#### Scenario: Capture starts after an alert or operator observation
- **WHEN** monitoring, datasource health, bounded bridge log or an operator
  first observes an anomaly
- **THEN** the bundle MUST record the trigger, first-observed time and capture
  start time
- **AND** it MUST collect pre-recovery evidence before a recovery mutation when
  that evidence remains available

#### Scenario: Evidence contains sensitive or unbounded data
- **WHEN** the collector encounters a lease token, raw native snapshot,
  business-table content, free-form provider dump or unbounded log
- **THEN** it MUST omit or reduce that value to an approved bounded summary
- **AND** the final bundle MUST contain a SHA-256 digest for every retained
  artifact

#### Scenario: A required postcondition is unavailable
- **WHEN** current provider state cannot be read authoritatively
- **THEN** the incident conclusion MUST remain `unknown`
- **AND** callback silence, heartbeat or progress from another subscription
  MUST NOT upgrade the conclusion

### Requirement: TDX anomalies retain native-list and delivery boundaries

TDX incident capture SHALL separately classify snapshot delivery failure,
unsubscribe non-convergence and unsubscribe verification failure. It MUST
preserve the existing terminal-native list as the unsubscribe authority and
MUST NOT infer the result from immediate provider text or `ErrorId`.

#### Scenario: A real snapshot delivery failure occurs
- **WHEN** the current TDX bridge logs a snapshot POST network failure or
  unusable response during a real subscribed session
- **THEN** evidence MUST record bridge build/SHA, symbol digest, observation
  time, bounded failure class and all available existing attempt information
- **AND** absence of a retry counter MUST remain `unknown` rather than be
  invented

#### Scenario: A real unsubscribe remains subscribed
- **WHEN** a fresh current-owner native list still contains the target after an
  unsubscribe attempt
- **THEN** the incident MUST classify
  `TDX_UNSUBSCRIBE_NOT_CONVERGED/subscribed`
- **AND** it MUST retain the bounded native-call outcome and fresh-list
  observation

#### Scenario: A real unsubscribe cannot be verified
- **WHEN** the current-owner native list probe fails, times out, is fenced or
  cannot be normalized after an unsubscribe attempt
- **THEN** the incident MUST classify
  `TDX_UNSUBSCRIBE_VERIFY_FAILED/unknown`
- **AND** recovery MUST NOT claim that physical unsubscribe completed

### Requirement: QMT anomalies retain handle, journal and owner boundaries

QMT incident capture SHALL preserve exact native return type/value, datasource
registry bucket, journal durability and current owner fence as separate facts.
It MUST NOT manufacture journal, lease, callback or native failures.

#### Scenario: A real QMT unsubscribe is unconfirmed
- **WHEN** `unsubscribe_quote` naturally raises or returns a value that the
  current contract does not accept
- **THEN** evidence MUST record the exact bounded type/value or exception class
  and the retained registry bucket
- **AND** it MUST classify physical subscription state as `unknown`

#### Scenario: A real QMT durability failure occurs
- **WHEN** intent, result, rotation or compaction durability fails during a real
  control operation
- **THEN** evidence MUST record the journal health category,
  `reconciliationRequired`, retained-recovery aggregate and last durable
  sequence/hash summary
- **AND** it MUST NOT repeat a native mutation solely to complete evidence

#### Scenario: A real QMT owner or callback anomaly occurs
- **WHEN** owner fencing, callback cessation, queue loss or callback shape
  produces a real runtime anomaly
- **THEN** evidence MUST preserve current owner/build identity and bounded local
  diagnostics
- **AND** it MUST not expose lease token or complete callback native data

### Requirement: Deferred anomaly evidence does not block normal-path release

A release whose normal-path gates pass SHALL NOT fail solely because a real
provider anomaly has not occurred. The release manifest SHALL link this change
and preserve every deferred branch as `not-observed`.

#### Scenario: Normal QMT and TDX HIL passes without an anomaly
- **WHEN** typed control, freshness, cleanup, recovery and protected-data gates
  pass and no real negative branch occurs
- **THEN** the current release MAY complete without synthetic fault evidence
- **AND** the manifest MUST list each deferred branch and this change as its
  future capture owner

#### Scenario: A later incident changes the understood contract
- **WHEN** reviewed real evidence contradicts the current provider assumption
- **THEN** contract or recovery behavior MUST be changed through a separate
  reviewed OpenSpec delta
- **AND** the incident bundle alone MUST NOT silently alter production behavior

### Requirement: Quantity contract deviations use the same dormant capture boundary

TDX and QMT realtime quantity anomalies SHALL be captured only after a naturally occurring missing-field,
type, grammar, scale, range, counter-jump or accepted-profile deviation. Evidence SHALL retain source, field,
bounded reason, artifact identity and observation window without retaining a complete raw native snapshot.

#### Scenario: Quantity negative behavior exists only in deterministic tests
- **WHEN** malformed, missing or drifting quantity behavior has not occurred in the real runtime
- **THEN** the live incident status MUST remain `not-observed`
- **AND** deterministic adapter tests MAY prove fail-closed behavior without blocking normal-path release

#### Scenario: A real quantity profile contradiction appears
- **WHEN** reviewed evidence contradicts the accepted source/runtime quantity profile or counter semantics
- **THEN** the incident bundle MUST preserve the bounded observed facts and current artifact identity
- **AND** product mode MUST remain off or shadow until a separate reviewed OpenSpec delta changes the contract

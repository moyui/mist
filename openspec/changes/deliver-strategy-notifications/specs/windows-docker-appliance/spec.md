## ADDED Requirements

### Requirement: Notification Worker Shall Be A Dedicated Appliance Service
The Windows appliance SHALL run the notification worker as a dedicated service reusing the shared image and
selecting the notification entrypoint by command, with Redis queue access, per-channel secrets injected via
deploy secret or env boundaries, an independent healthcheck, and rollback that does not affect strategy,
candle, or transport services.

#### Scenario: Notification worker is deployed
- **WHEN** the appliance stack is brought up
- **THEN** a dedicated notification service MUST be present
- **AND** it MUST connect to the shared Redis for the strategy-alert-delivery queue
- **AND** channel credentials MUST be supplied via secrets, not baked into the image

#### Scenario: Notification worker is rolled back
- **WHEN** the notification service is stopped or rolled back
- **THEN** strategy evaluation, candle, and transport services MUST remain unaffected
- **AND** already committed Signal and AlertEvent records MUST remain intact

## MODIFIED Requirements

### Requirement: Notification Delivery Shall Consume Persisted Alert Events

Proactive notification delivery SHALL consume Mist-owned PENDING AlertEvent records and SHALL NOT evaluate strategy rules, listen to raw market triggers, or read datasource services. Message content SHALL be built from persisted Signal/AlertEvent evidence and approved templates only. When formatting a `chan_bsp` alert event, the notification envelope MUST distinguish the structural unit level (`bi` as 笔级, `duan` as 段级), the specific buy/sell point type (一买/二买/三买/一卖/二卖/三卖), and the trigger price.

#### Scenario: A chan_bsp alert event is rendered for WeChat delivery

- **WHEN** the notification worker builds an envelope for a `chan_bsp` signal
- **THEN** the summary MUST render the structural unit label (`笔级` or `段级`)
- **AND** the summary MUST render the Chinese point type (`一买`, `二买`, `三买`, `一卖`, `二卖`, `三卖`)
- **AND** the trigger price MUST be formatted when available (e.g. `@ 3050.25`)

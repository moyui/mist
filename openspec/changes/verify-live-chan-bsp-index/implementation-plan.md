# 实施计划 — 实盘验证缠论买卖点算法（指数标的）

配套 OpenSpec change：`openspec/changes/verify-live-chan-bsp-index/`（proposal / design / tasks / delta specs 已就绪）。本计划提供代码级落地细节、Mock 测试规范、生产数据预热及实盘观测 Runbook。

---

## 0. 质量约束与架构边界

| 维度 | 本次落实规范 |
|---|---|
| **订阅类型放开** | 升级 `RealtimeSecurityAllowlistService`、`RealtimeSubscriptionLifecycleCoordinator`、`InitializeRealtimeSubscriptionDto` 与 `RealtimeSubscriptionVo`，从单值 `SecurityType.STOCK` 扩展为 `[SecurityType.STOCK, SecurityType.INDEX]`。 |
| **标的与源路由** | 交易所官方标准指数（`000001.SH` 上证、`399006.SZ` 创业板、`000688.SH` 科创50）走 QMT 原生全推；通达信专有板块指数（`880003` 平均股价）走 TDX 内置 Bridge。 |
| **策略求值与周期** | 每个指数并行配置 4 组独立策略：**5m 笔级**、**5m 段级**、**30m 笔级**、**30m 段级**。买卖双向全开（`direction: both`, `points: {first:true, second:true, third:true}`）。 |
| **历史数据预热** | 5m 要求 >=500 根（~10.4交易日），30m 要求 >=200 根（~25交易日）。开盘前通过 `schedule/collector` 提前采集过去 30 个交易日的历史 K 线至 MySQL `ks` 表。 |
| **告警信封与文案** | 增强 `notification-envelope.ts`，在微信群机器人推送中明确渲染 `[笔级/段级]`、`[一买/二买/三买/一卖/二卖/三卖]` 及触发价格 `@ 3xxx.xx`。 |
| **Mock 驱动** | 先完成纯内存 Mock 单元/集成测试，证明逻辑闭环后，再进行生产环境数据录入与实盘观测。 |

---

## 1. 代码修改细节（File-by-File）

### 1.1 `apps/mist/src/realtime/realtime-security-allowlist.service.ts`
- **目标**：查询白名单时包含 `STOCK` 和 `INDEX`。
- **修改位置**：`refreshAssignedFromDb` 方法（约 Line 72）。
- **代码变更**：
  ```ts
  // 修改前：
  .where('security.type = :stock', { stock: SecurityType.STOCK })

  // 修改后：
  .where('security.type IN (:...types)', {
    types: [SecurityType.STOCK, SecurityType.INDEX],
  })
  ```

### 1.2 `apps/mist/src/realtime-subscriptions/realtime-subscription-lifecycle.coordinator.ts`
- **目标**：期望权威（Desired Authority）查询包含 `STOCK` 和 `INDEX`。
- **修改位置**：`queryDesiredAuthority` 方法（约 Line 385）。
- **代码变更**：
  ```ts
  // 修改前：
  .where('security.type = :stock', { stock: SecurityType.STOCK })

  // 修改后：
  .where('security.type IN (:...types)', {
    types: [SecurityType.STOCK, SecurityType.INDEX],
  })
  ```

### 1.3 `apps/mist/src/realtime-subscriptions/dto/initialize-realtime-subscription.dto.ts`
- **目标**：API DTO 接受 `SecurityType.INDEX`。
- **修改位置**：Line 31, Line 62, Line 107。
- **代码变更**：
  ```ts
  // 修改前：
  @ApiProperty({ enum: [SecurityType.STOCK] })
  securityType!: SecurityType.STOCK;

  @ApiPropertyOptional({ enum: [SecurityType.STOCK] })
  @IsIn([SecurityType.STOCK])
  securityType?: SecurityType.STOCK;

  // 修改后：
  @ApiProperty({ enum: [SecurityType.STOCK, SecurityType.INDEX] })
  securityType!: SecurityType;

  @ApiPropertyOptional({ enum: [SecurityType.STOCK, SecurityType.INDEX] })
  @IsIn([SecurityType.STOCK, SecurityType.INDEX])
  securityType?: SecurityType;
  ```

### 1.4 `apps/mist/src/realtime-subscriptions/vo/realtime-subscription.vo.ts`
- **目标**：VO 输出 `SecurityType` 枚举。
- **代码变更**：
  ```ts
  // 修改前：
  @ApiProperty({ enum: [SecurityType.STOCK] })
  securityType!: SecurityType.STOCK;

  // 修改后：
  @ApiProperty({ enum: SecurityType })
  securityType!: SecurityType;
  ```

### 1.5 `libs/signal/src/runtime/chan-bsp/chan-bsp.snapshot.serializer.ts`
- **目标**：将 `triggerPrice` 显式写入顶层 contextSnapshot。
- **代码变更**：
  ```ts
  export function serializeChanBspContextSnapshot(
    event: ChanBspEvent,
    level: number,
  ): Readonly<Record<string, unknown>> {
    const chanBsp: ChanBspContextSnapshot['chanBsp'] = {
      type: event.type,
      units: event.units,
      level,
      zhongshuIndex: event.zhongshuIndex,
      zg: event.zg,
      zd: event.zd,
    };
    return Object.freeze({
      triggerPrice: event.price,
      chanBsp: Object.freeze(chanBsp),
    });
  }
  ```

### 1.6 `apps/notification/src/delivery/notification-envelope.ts`
- **目标**：解析 `chanBsp` 上下文，增强摘要文案。
- **修改位置**：`buildNotificationEnvelope` 与辅助函数。
- **代码变更**：
  ```ts
  const CHAN_BSP_TYPE_NAMES: Record<string, string> = {
    first_buy: '一买',
    second_buy: '二买',
    third_buy: '三买',
    first_sell: '一卖',
    second_sell: '二卖',
    third_sell: '三卖',
  };

  function directionLabelFromChanBsp(
    chanBsp: Record<string, unknown> | undefined,
    defaultDirection: unknown,
  ): string {
    if (chanBsp && typeof chanBsp.type === 'string') {
      const name = CHAN_BSP_TYPE_NAMES[chanBsp.type] ?? chanBsp.type;
      const unit = chanBsp.units === 'duan' ? '段级' : '笔级';
      return `${name} (${unit})`;
    }
    if (defaultDirection === 'entry') return '买入';
    if (defaultDirection === 'exit') return '卖出';
    return String(defaultDirection ?? 'signal');
  }
  ```

---

## 2. 离线 Mock 验证套件

我们将编写以下 3 组针对性 Mock 测试（全部采用纯内存运行，无外部依赖）：

### 2.1 订阅生命周期与 DTO Mock 测试
- **文件**：`apps/mist/src/realtime-subscriptions/realtime-index-subscription.mock.spec.ts`
- **测试覆盖**：
  1. `RealtimeSecurityAllowlistService` 在库中包含 `SecurityType.INDEX` 时，能够成功加载并授权指数符号。
  2. `RealtimeSubscriptionLifecycleCoordinator` 在 09:15 / 定时对齐时，正确将 `INDEX` 标的纳入期望权威集合。
  3. `InitializeRealtimeSubscriptionDto` 对 `securityType: 'INDEX'` 校验通过，对非法类型（如 `'CRYPTO'`）拒绝。

### 2.2 多周期指数聚合与窗口拼接 Mock 测试
- **文件**：`apps/signal/src/realtime/signal-index-period-aggregation.mock.spec.ts`
- **测试覆盖**：
  1. 构造 480 根历史 5m K 线（MySQL mock）+ 当日 20 根 1m candle（Redis mock）。
  2. 验证 `SignalStrategyMarketDataAdapter.loadRealtimeWindow` 经 `derivePeriodBars` 聚合后，产出长度为 500 的连续 5m 策略窗口。
  3. 验证 30m 周期同样正确将 1m 桶合成 30m 桶并拼接历史 30m K 线。

### 2.3 4 大指数 5m/30m 笔/段买卖点求值与通知 Mock 测试
- **文件**：`libs/signal/src/runtime/chan-bsp/chan-bsp-index-evaluation.mock.spec.ts`
- **测试覆盖**：
  1. 使用真实指数历史数据构造 500 根 5m 窗口与 200 根 30m 窗口。
  2. 验证 `ChanBspDetector.evaluate` 在 `units: 'bi'` 与 `units: 'duan'` 下均能稳定完成分型、宽笔、线段、中枢延伸合并及背驰力度计算。
  3. 验证 `ChanBspEpisodeCursor` 对新出现的买卖点正确产生 candidate 信号。
  4. 验证 `buildNotificationEnvelope` 生成的推送消息包含 `一买 (笔级) @ 3050.25` 等规范文案。

---

## 3. 生产环境准备（纯 API 接口驱动）

所有配置操作均通过 Mist 官方标准 REST API 接口完成，**无需直接操作 SQL**：

### 3.1 初始化证券并创建实时订阅路由（POST /v1/realtime-subscriptions）

调用 `POST /v1/realtime-subscriptions`（`mode: 'new'`），后端将在单事务内原子创建 `Security`（`type: 'INDEX'`）、`SecuritySourceConfig` 并绑定激活订阅路由：

```bash
# 1. 上证指数 (000001.SH -> QMT)
curl -X POST http://localhost:8001/v1/realtime-subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "new",
    "securityCode": "000001",
    "securityName": "上证指数",
    "securityType": "INDEX",
    "source": "qmt",
    "providerSymbol": "000001.SH"
  }'

# 2. 创业板指 (399006.SZ -> QMT)
curl -X POST http://localhost:8001/v1/realtime-subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "new",
    "securityCode": "399006",
    "securityName": "创业板指",
    "securityType": "INDEX",
    "source": "qmt",
    "providerSymbol": "399006.SZ"
  }'

# 3. 科创50 (000688.SH -> QMT)
curl -X POST http://localhost:8001/v1/realtime-subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "new",
    "securityCode": "000688",
    "securityName": "科创50",
    "securityType": "INDEX",
    "source": "qmt",
    "providerSymbol": "000688.SH"
  }'

# 4. 平均股价 (880003 -> TDX)
curl -X POST http://localhost:8001/v1/realtime-subscriptions \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "new",
    "securityCode": "880003",
    "securityName": "平均股价",
    "securityType": "INDEX",
    "source": "tdx",
    "providerSymbol": "880003.SH"
  }'
```

### 3.2 历史 K 线数据采集预热（POST /v1/collector/collect）

调用 `POST http://localhost:8003/v1/collector/collect`，为 4 个指数预热过去 30 个交易日的 5m（>=500根）与 30m（>=200根）历史 K 线：

```bash
# === 采集 5m 历史 K 线 (覆盖 500 根预算) ===
curl -X POST http://localhost:8003/v1/collector/collect \
  -H "Content-Type: application/json" \
  -d '{"stockCode": "000001", "period": 5, "startDate": "2026-07-01", "endDate": "2026-08-25", "dataSource": "QMT"}'

curl -X POST http://localhost:8003/v1/collector/collect \
  -H "Content-Type: application/json" \
  -d '{"stockCode": "399006", "period": 5, "startDate": "2026-07-01", "endDate": "2026-08-25", "dataSource": "QMT"}'

curl -X POST http://localhost:8003/v1/collector/collect \
  -H "Content-Type: application/json" \
  -d '{"stockCode": "000688", "period": 5, "startDate": "2026-07-01", "endDate": "2026-08-25", "dataSource": "QMT"}'

curl -X POST http://localhost:8003/v1/collector/collect \
  -H "Content-Type: application/json" \
  -d '{"stockCode": "880003", "period": 5, "startDate": "2026-07-01", "endDate": "2026-08-25", "dataSource": "TDX"}'

# === 采集 30m 历史 K 线 (覆盖 200 根预算) ===
curl -X POST http://localhost:8003/v1/collector/collect \
  -H "Content-Type: application/json" \
  -d '{"stockCode": "000001", "period": 30, "startDate": "2026-06-01", "endDate": "2026-08-25", "dataSource": "QMT"}'

curl -X POST http://localhost:8003/v1/collector/collect \
  -H "Content-Type: application/json" \
  -d '{"stockCode": "399006", "period": 30, "startDate": "2026-06-01", "endDate": "2026-08-25", "dataSource": "QMT"}'

curl -X POST http://localhost:8003/v1/collector/collect \
  -H "Content-Type: application/json" \
  -d '{"stockCode": "000688", "period": 30, "startDate": "2026-06-01", "endDate": "2026-08-25", "dataSource": "QMT"}'

curl -X POST http://localhost:8003/v1/collector/collect \
  -H "Content-Type: application/json" \
  -d '{"stockCode": "880003", "period": 30, "startDate": "2026-06-01", "endDate": "2026-08-25", "dataSource": "TDX"}'
```

### 3.3 创建并启用 16 组策略定义（POST /v1/strategies）

为每个指数分别创建 5m 笔级、5m 段级、30m 笔级、30m 段级 策略定义并启用（以 `000001` 上证指数为例）：

```bash
# 1. 创建上证指数 5m 笔级策略
CREATE_RES=$(curl -s -X POST http://localhost:8001/v1/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "上证指数 5m 笔级缠论买卖点",
    "kind": "chan_bsp",
    "targetUniverse": ["000001"],
    "periods": [5],
    "sources": ["QMT"],
    "signalKind": "entry",
    "rule": {
      "units": "bi",
      "direction": "both",
      "points": { "first": true, "second": true, "third": true }
    }
  }')
# 提取返回的策略 ID 并启用
STRATEGY_ID=$(echo $CREATE_RES | jq -r '.data.id')
curl -X POST "http://localhost:8001/v1/strategies/${STRATEGY_ID}/enable"

# 2. 创建上证指数 5m 段级策略
CREATE_RES=$(curl -s -X POST http://localhost:8001/v1/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "上证指数 5m 段级缠论买卖点",
    "kind": "chan_bsp",
    "targetUniverse": ["000001"],
    "periods": [5],
    "sources": ["QMT"],
    "signalKind": "entry",
    "rule": {
      "units": "duan",
      "direction": "both",
      "points": { "first": true, "second": true, "third": true }
    }
  }')
STRATEGY_ID=$(echo $CREATE_RES | jq -r '.data.id')
curl -X POST "http://localhost:8001/v1/strategies/${STRATEGY_ID}/enable"

# 3. 创建上证指数 30m 笔级策略
CREATE_RES=$(curl -s -X POST http://localhost:8001/v1/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "上证指数 30m 笔级缠论买卖点",
    "kind": "chan_bsp",
    "targetUniverse": ["000001"],
    "periods": [30],
    "sources": ["QMT"],
    "signalKind": "entry",
    "rule": {
      "units": "bi",
      "direction": "both",
      "points": { "first": true, "second": true, "third": true }
    }
  }')
STRATEGY_ID=$(echo $CREATE_RES | jq -r '.data.id')
curl -X POST "http://localhost:8001/v1/strategies/${STRATEGY_ID}/enable"

# 4. 创建上证指数 30m 段级策略
CREATE_RES=$(curl -s -X POST http://localhost:8001/v1/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "上证指数 30m 段级缠论买卖点",
    "kind": "chan_bsp",
    "targetUniverse": ["000001"],
    "periods": [30],
    "sources": ["QMT"],
    "signalKind": "entry",
    "rule": {
      "units": "duan",
      "direction": "both",
      "points": { "first": true, "second": true, "third": true }
    }
  }')
STRATEGY_ID=$(echo $CREATE_RES | jq -r '.data.id')
curl -X POST "http://localhost:8001/v1/strategies/${STRATEGY_ID}/enable"
```
（对其余 3 个标的 `399006`, `000688`, `880003` 重复上述创建与启用即可，`880003` 的 `sources` 指定为 `["TDX"]`）

---

## 4. 实盘开盘验证 Runbook（明日交易时段）

### 4.1 09:05 盘前主动巡检
- 检查 `GET /v1/system/pre-market-inspection` 状态卡片。
- 确认 MySQL、Redis、QMT Bridge、TDX Bridge、Signal App、Notification App 健康状态全部为 `OK`。

### 4.2 09:15 盘前订阅对齐
- 观测后端日志：`RealtimeSubscriptionLifecycleCoordinator` 执行 09:15 read-before-reset。
- 验证 QMT 收到 `sync_subscriptions` 包含 `000001.SH`, `399006.SZ`, `000688.SH`；TDX 收到 `880003`。

### 4.3 09:30~09:35 开盘与首根 5m 封存
- 观测 09:30 首根 1m tick 流入，Redis `closed` 桶计数正常增加。
- 观测 09:35 首根 5m candle 封存后，BullMQ 派发策略求值任务。
- 查看 `apps/signal` 日志确认 `evaluate` 在 500 根窗口下平稳运行，无类型或数组越界错误。

### 4.4 盘中告警观测
- 观测当指数出现标准一/二/三类买卖点时，飞书机器人是否收到格式为（已弃用企业微信）：
  `[Mist] 000001 上证指数 一买 (笔级) @ 3050.25 | 上证指数 5m 笔级缠论买卖点 | 5分钟 | 2026-08-26 10:15:00` 的实时推送。

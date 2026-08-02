## Why

当前 Indicator service 同时负责数据库读取与数学计算，独立 `chan-api` 又直接导入
`apps/mist` 内部模块。实时策略若直接复用这些应用模块，会继续扩大跨 app 耦合并让纯计算依赖
HTTP、TypeORM 和运行时配置。

## What Changes

- 抽取不访问数据库、Redis、HTTP、Nest controller 或环境变量的 Indicator 纯计算内核。
- 抽取不持久化、不查询 K 数据的 Chan 纯计算内核，保留现有 Phase A/Phase B 算法语义。
- 让 `apps/mist` indicator adapter、`apps/chan` HTTP adapter 和 strategy runtime 的 Indicator 计算复用
  相同纯内核；V1 strategy 不计算或暴露 `chan.*`，未来接入 Chan 必须另开 change。
- 保留现有公共 API、响应契约和 Chan 无持久化边界；本 change 不新增策略字段或买卖点算法。
- 评审并选择 Chan 公共路由的最终唯一 owner，但路由迁移或删除必须进入后续独立 change。
- 每个模块移动、输入输出类型和数值错误语义在实施前逐项评审并记录。

## Capabilities

### New Capabilities

- `market-analysis-kernels`: 定义共享的纯 Indicator/Chan 计算边界；V1 strategy 只消费 Indicator exports。

### Modified Capabilities

- `chan-derived-analysis-lifecycle`: 明确 Chan 由纯内核请求时派生，adapter 负责取数，仍不持久化。

## Impact

- **`mist`**：新增或调整 analysis libraries，重接 Indicator/Chan adapters 和 tests。
- **`apps/chan`**：停止跨 app 导入业务模块，改为依赖共享 library。
- **不包含**：公共 API 改名、数据库 migration、实时 worker、通知投递和 Chan persistence。

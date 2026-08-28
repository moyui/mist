# 回测图表渲染与接口治理修复交接文档 (2026-08-28)

本文档汇总了本次关于**回测历史接口质量治理**、**前端 TradingView 缠论图表渲染修复**、**时区与买卖点语义对齐**以及 **Windows 部署与 CI/CD 运维基建加固**的完整排查过程、核心根因、修改代码和验证结论，供后续 Agent / 开发者直接交接与参考。

---

## 一、本次解决的核心问题概览

| 维度 | 问题现象 | 根因 (Root Cause) | 解决方案与结论 |
| :--- | :--- | :--- | :--- |
| **后端 API 质量治理** | `GET /v1/strategy-backtests` 存在缺少标准 DTO、未校验 limit 边界、未对齐 OpenSpec 契约等质量问题 | 接口初版实现为内部直查，未通过 `class-validator` DTO 隔离边界与 Swagger 错误码注解 | 创建 [`ListBacktestRunsQueryDto`](file:///Users/moyui/sean/mist/mist/apps/mist/src/strategy/dto/list-backtest-runs-query.dto.ts)，使用 `@Type(() => Number)` / `@Min(1)` / `@Max(100)` 严格校验，补全 `@ApiTechnicalErrorResponse` 与 OpenSpec 规范，单测覆盖率 100%。 |
| **前端 K 线与笔段渲染** | 回测工作台图表不显示 K 线蜡烛图，仅显示孤立笔/段直线 | MySQL `DECIMAL` 类型在 JSON 序列化为字符串（如 `"3905.20"`），前端 `Number.isFinite(item.open)` 对字符串求值为 `false`，导致 100% K 线被错误过滤剔除 | 在 [`TradingViewChart.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/components/tv-chart/TradingViewChart.tsx) 过滤与格式化前，对 OHLCV 及画图坐标显式执行 `Number(...)` 转换，并支持 `volume ?? amount` 成交量字段回退。 |
| **时区与买卖点语义** | 图表 X 轴与下方命中信号列表显示 UTC 原始时间（如 `02:20`），信号类型显示为 `▼ signal` | 1. 时间戳直接使用 UTC 未本地化；<br>2. 缠论买卖点类型位于 `contextSnapshot.chanBsp.type`（如 `third_buy`），触发价格位于 `triggerPrice` | 1. TradingView 配置 `Asia/Shanghai` 本地化格式器；<br>2. [`BacktestSignalTable.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/backtests/components/BacktestSignalTable.tsx) 适配 `contextSnapshot.chanBsp`，准确展示 `▲ 3买` 徽标、触发价格与 CST 时间。 |
| **Windows 宿主部署基建** | 电脑重启后 Docker compose 无法拉起；非交互环境 `docker login`/`docker pull` 失败 | 1. Runner 环境变量 PATH 缺失 Docker 路径；<br>2. `credsStore: "desktop"` 在非桌面交互 Session 下无法调用 wincred GUI；<br>3. `docker-compose` 插件未安装至全用户目录 | 1. 将 Docker CLI/Plugins 添加到 Machine PATH；<br>2. 部署插件到全用户目录；<br>3. 重命名 `docker-credential-wincred/desktop` 禁用 GUI 凭据管理器，回退至原生配置存储。 |

---

## 二、关键文件修改明细

### 1. `mist` 仓库 (主后端)

- [`apps/mist/src/strategy/dto/list-backtest-runs-query.dto.ts`](file:///Users/moyui/sean/mist/mist/apps/mist/src/strategy/dto/list-backtest-runs-query.dto.ts) *(新增)*
  - 使用 `class-validator` 和 `class-transformer` 定义标准分页过滤 DTO。
  - 属性：`limit` (可选，整数，1~100，默认 20)，`cursor` (可选，整数)，`status` (可选，枚举)，`strategyDefinitionId` (可选，整数)。
- [`apps/mist/src/strategy/controllers/strategy-backtest.controller.ts`](file:///Users/moyui/sean/mist/mist/apps/mist/src/strategy/controllers/strategy-backtest.controller.ts)
  - 标准化 `@Get()` 请求参数为 `@Query() query: ListBacktestRunsQueryDto`。
  - 增加 `@ApiTechnicalErrorResponse({ status: 400, codes: ['VALIDATION_ERROR'] })` 装饰器。
- [`apps/mist/src/strategy/services/backtest-run-query.service.ts`](file:///Users/moyui/sean/mist/mist/apps/mist/src/strategy/services/backtest-run-query.service.ts)
  - 重构 `listRuns` 支持标准 DTO 入参，在服务端执行 `limit` 范围硬夹紧 (1~100)。
- [`apps/mist/src/strategy/services/backtest-run-query.service.spec.ts`](file:///Users/moyui/sean/mist/mist/apps/mist/src/strategy/services/backtest-run-query.service.spec.ts) *(新增)*
  - 验证空参默认值、分页过滤、limit 越界夹紧。
- [`openspec/specs/backtest-runtime/spec.md`](file:///Users/moyui/sean/mist/mist/openspec/specs/backtest-runtime/spec.md)
  - 补充 `Requirement: Backtest Run List Query Shall Use The Mist HTTP DTO/VO Boundary` 规范。

#### 2. `mist-fe` 仓库 (前端)

- [`app/lib/time.ts`](file:///Users/moyui/sean/mist/mist-fe/app/lib/time.ts) *(新增)*
  - 建立全前端统一的 `Asia/Shanghai` 时区核心库。
  - 提供 `formatShanghaiDateTime`、`formatShanghaiDate`、`formatShanghaiTime`、`formatShanghaiShort`、`formatShanghaiLocalDateTimeInput`、`parseShanghaiDateTimeToIso`、`getShanghaiDateParts` 等纯函数，杜绝跨端 hydration 不一致与 UTC 漂移。
- [`app/components/tv-chart/TradingViewChart.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/components/tv-chart/TradingViewChart.tsx)
  - **数值强转与有效性过滤**：在 `sortedK` 处理链中先对 `open`/`high`/`low`/`close`/`volume` 进行 `Number(...)` 转换，再执行 `Number.isFinite(...)` 过滤。
  - **时区本地化配置**：在 `createChart` 初始化时注入 `localization`（`timeFormatter` 使用 `formatShanghaiDateTime`）及 `timeScale.tickMarkFormatter`（使用 `formatShanghaiTime`）。
  - **笔/线段/中枢线数值保护**：确保 `line.startPrice`、`line.endPrice`、`band.top`、`band.bottom` 进行 `Number(...)` 校验与数值强转。
- [`app/components/tv-chart/TradingViewLineChart.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/components/tv-chart/TradingViewLineChart.tsx)
  - 补全 `localization` 与 `timeScale` 时区本地化，统一为 `Asia/Shanghai`。
- [`app/backtests/components/BacktestConfigPanel.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/backtests/components/BacktestConfigPanel.tsx)
  - 时间输入框默认值与快捷按钮（近1周/近1月/近半年/今年以来等）严格基于 `Asia/Shanghai` 09:30~15:00 交易时段生成。
  - 表单提交时通过 `parseShanghaiDateTimeToIso` 将本地时间绑定 `+08:00` 转换为标准 UTC ISO 字符串，防止因浏览器本地时区导致的日界错位。
- [`app/backtests/components/BacktestRunHistory.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/backtests/components/BacktestRunHistory.tsx)
  - 任务历史列表时间采用 `formatShanghaiShort` 显示为 CST 时间（如 `08-28 00:15:22`）。
- [`app/backtests/components/BacktestSignalTable.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/backtests/components/BacktestSignalTable.tsx)
  - **买卖点语义解析**：从 `sig.contextSnapshot.chanBsp` 提取 `type`（如 `third_buy`），正确映射至 `3买` / `3卖`。
  - **触发价格解析**：读取 `ctx.triggerPrice ?? ctx.price`。
  - **时间格式化**：采用 `formatShanghaiDateTime` 统一输出 CST 时间。
- [`app/backtests/components/ChanDiagnosisDrawer.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/backtests/components/ChanDiagnosisDrawer.tsx)
  - 时间格式化采用 `formatShanghaiDateTime`，并支持从 `chanBsp` 读取 `zg`/`zd`/`gg`/`dd`/`price`。
- [`app/strategies/StrategiesWorkspace.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/strategies/StrategiesWorkspace.tsx)
  - 替换 naive 字符串切分，统一使用 `formatShanghaiDateTime`。
- [`app/settings/realtime-subscriptions/page.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/settings/realtime-subscriptions/page.tsx)
  - 实时订阅列表更新时间统一使用 `formatShanghaiDateTime`。
- [`app/k/KLineLivePage.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/k/KLineLivePage.tsx)
  - K 线图表页日期选择与快捷区间统一基于 `Asia/Shanghai`。
- [`app/backtests/BacktestWorkspace.tsx`](file:///Users/moyui/sean/mist/mist-fe/app/backtests/BacktestWorkspace.tsx)
  - 顶部指标栏回测起止日期采用 `formatShanghaiDate` 格式化。
- [`app/api/client.ts`](file:///Users/moyui/sean/mist/mist-fe/app/api/client.ts)
  - 定义 `ListStrategyBacktestRunsQuery` 类型并标准化 `listStrategyBacktestRuns` 方法。

---

## 三、部署与环境运维要点 (Windows API Machine)

在 Windows 10/11 + Docker Desktop 环境中运行 GitHub Actions self-hosted runner 时，踩坑记录与标准配置：

1. **Docker CLI 与 Compose 环境变量**：
   - 必须确保 `C:\Program Files\Docker\Docker\resources\bin` 与 `C:\Program Files\Docker\Docker\resources\cli-plugins` 位于 **Machine PATH**（系统全局环境变量），避免 Runner Windows Service 启动后找不到 `docker` 命令。
   - Compose 插件须同时拷贝至 `C:\Users\<user>\.docker\cli-plugins` 与 `C:\Program Files\Docker\cli-plugins`。
2. **非交互 SSH / CI Runner 下的 Docker Pull 凭据**：
   - Docker Desktop 默认启用的 `docker-credential-desktop.exe` 和 `docker-credential-wincred.exe` 依赖 Windows 交互式桌面 Session，在 SSH / Runner 后台服务环境下调用会抛出 `A specified logon session does not exist`。
   - 解决方案：重命名两个可执行文件为 `.bak`，并在 `%USERPROFILE%\.docker\config.json` 中移除 `"credsStore": "desktop"`，回退至原生 base64 存储。

---

## 四、验证结果与交付物

1. **单测与 CI 门禁**：
   - `mist` 仓库：回测模块 11 个测试套件（91 个单测）全部通过。
   - `mist-fe` 仓库：全量 20 个测试套件（157 个单测）全部通过。
2. **生产环境验证**：
   - `mist-docker-appliance` 栈内全部 13 个容器均处于 `UP (healthy)` 状态。
   - 回测历史时间、指标栏起止日期、TradingView 时间轴、信号明细表格均严格对齐 `Asia/Shanghai` (UTC+8) 北京时间。
   - 完整复盘图表：2,928 根 5 分钟 K 线、成交量柱状图、笔折线（金黄）、线段折线（洋红）、7 个精准买卖点标记（3买等）均正常渲染无缺失。（`web-gateway`, `mist-fe`, `mist-backend`, `chan-api`, `mist-signal`, `mist-notification`, `mist-backtest`, `mist-schedule`, `mysql`, `mist-realtime-redis`, `openobserve`, `tdx-datasource`, `qmt-datasource`）全部正常启动并处于 `healthy` 状态。
3. **真机无头浏览器截屏复核**：
   - 访问 `http://192.168.31.182/backtests`，2,928 根 K 线、黄色笔、洋红色线段、中枢参考线、7 个 3 买标记点以及下方 CST 信号列表均精确渲染。

---

## 五、后续交接建议

1. **更多策略回测验证**：
   - 当前已验证通过的策略为 `#22 平均股价 30m 段级缠论买卖点`（在 5m K 线上执行求值并产生 7 个买卖点）。后续接入新策略时可直接在回测工作台发起测试。
2. **数据源回测覆盖**：
   - QMT 5m 数据较全（数千根），TDX 5m 当前本地存量较少。若需要长时间跨度的 TDX 回测，需通过定时采集任务补全历史分时 K 线。

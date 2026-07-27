# Mist 智能股票分析系统

Mist 是面向 A 股的行情采集、技术指标、缠论分析、策略信号与告警系统。仓库采用
NestJS monorepo，生产环境由 Windows Docker Compose appliance、TDX/QMT 桌面终端
及其 builtin bridge 组成。

## 能力边界

- 技术指标：MACD、RSI、KDJ、ADX、ATR 等 TA-Lib 指标。
- 缠论：合并 K、分型、笔、中枢，以及 Phase A/Phase B 诊断输出。
- 多数据源：东方财富、TDX、大 QMT。
- 策略：定义、版本、信号、告警事件和 signal-level 回测。
- 对外集成：同源 Web API、`mist-fe`、`mist-skills` 与 AstrBot。

TDX 与 QMT 不共用 datasource contract：TDX 历史接口返回 normalized rows，QMT
历史接口保留 native column shape；backend 在业务边界统一。当前实时 transport 已
通过 Windows HIL，但仍是 memory-only，不写快照表、不合成实时 K、不触发通知。

## 仓库结构

```text
apps/
  mist/                 主 API，端口 8001
  chan/                 缠论分析 API，端口 8008
libs/                   配置、共享数据、时区与工具
deploy/database/        SQL migrations
deploy/docker/          镜像内 Docker 契约
docs/                   当前运行手册与集成说明
openspec/               产品规范、living roadmap 与历史归档
tools/                  迁移、契约和维护脚本
```

`apps/schedule` 不属于当前生产 Docker 栈。数据采集调度的后续归属由 active
OpenSpec change 管理，不要通过恢复旧 scheduler 目录绕过该决策。

## 本地开发

要求：Node.js 24+、pnpm、MySQL 8+。

```bash
pnpm install
pnpm run start:dev:mist
pnpm run start:dev:chan
```

常用地址：

- Mist API：`http://127.0.0.1:8001`
- Swagger：`http://127.0.0.1:8001/api-docs`
- Chan API：`http://127.0.0.1:8008`

数据库必须通过 migration 管理，所有环境保持 `synchronize: false`：

```bash
pnpm run db:migrate
```

## 验证

```bash
env TZ=UTC pnpm run test:ci
pnpm run lint
pnpm run typecheck
pnpm run ci:contracts
pnpm run build:docker
openspec validate --all --strict
```

UTC 测试用于防止 A 股交易时段与日期格式依赖本机时区。

## 生产部署

生产环境不从本仓库直接执行 `docker compose up`。唯一部署入口是
`mist-deploy` 的 `Deploy Windows Mist Stack` workflow，镜像标签必须是完整 commit
SHA。当前拓扑：

```text
Docker Desktop
  mysql, mist-backend, chan-api, mist-fe, web-gateway
  tdx-datasource :9001, qmt-datasource :9002, monitoring

Windows 用户会话
  TDX Desktop + builtin bridge
  QMT Desktop + builtin bridge
```

生产访问统一走 `http://www.moyui.mist`：

- 前端：`/k`、`/strategies`
- Mist API：`/api/mist/*`
- Chan API：`/api/chan/*`

## 文档入口

- [生产基线验证](docs/production-baseline-verification.md)
- [跨仓库文档盘点](docs/documentation-audit-2026-07-22.md)
- [Backend 与 datasource 集成](docs/backend-datasource-integration.md)
- [Windows Docker 拓扑](deploy/docker/README-Windows-Docker.md)
- [Chan 当前算法](apps/chan/README.md)
- [Living production roadmap](openspec/changes/define-mist-production-roadmap/)

`Roadmap.md` 是早期历史草稿，不是当前执行清单。当前任务与完成状态只以 OpenSpec
active changes 和 living roadmap 为准。

## 许可证

BSD-3-Clause

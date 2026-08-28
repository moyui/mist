# apps/schedule — 定时任务与权威数据采集服务

`apps/schedule` 负责 Mist 系统的周期性调度任务，包括盘前主动体检巡检、历史 K 线定时采集、以及收盘后数据源权威数据同步。


> 返回：[顶层 README](../../README.zh-CN.md) · [文档编写指南](../../docs/governance/documentation-guide.md)

---

## 🎯 模块职责

- **盘前主动巡检（09:05）**：执行 A 股盘前健康度体检，核验 TDX/QMT 桥接状态、订阅阻塞与 Journal 一致性，生成诊断卡片并推至通知通道。
- **收盘权威数据同步**：在交易日收盘后从数据源拉取权威 K 线数据，覆盖日内实时聚合蜡烛，消除临时采样偏差。
- **历史数据定时拉取**：按计划批量调度各证券历史日线与分钟线入库。

---

## 🔌 核心接口与调度机制

| 触发机制 / 路由 | 调度时间 / 方法 | 说明 |
| :--- | :--- | :--- |
| `PreMarketInspection` | 工作日 `09:05` (Cron) | 盘前主动健康巡检与阻塞告警 |
| `PostCloseSync` | 工作日 `15:30` (Cron) | 收盘后全量权威 K 线同步覆盖 |
| `POST /v1/collector/collect` | 手动触发 / POST | 指定证券与周期的 K 线采集执行 |
| `GET /app/hello` | GET | 服务健康检查探针 |

---

## 📂 关键文件速查

- `src/pre-market-inspection.service.ts`：09:05 盘前体检与阻塞告警核心逻辑。
- `src/data-collection.controller.ts`：数据采集任务触发与控制入口。
- `src/schedule.module.ts`：NestJS Schedule 调度模块配置。

---

## 🛠️ 专属调试与测试

```bash
# 启动本地定时任务服务 (默认端口 8003)
pnpm exec nest start schedule

# 运行定时任务单元与集成测试
pnpm run test -- apps/schedule
```

---

## 🔗 上下游边界

- **依赖**：`libs/timezone`（精确交易日与时区判断）、`libs/shared-data`（MySQL 历史 K 线表操作）、`mist-datasource`（数据采集上游）。
- **联动**：与 `apps/notification` 联动推送巡检报告与异常阻塞告警。

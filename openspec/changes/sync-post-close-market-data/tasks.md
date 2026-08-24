# Tasks: sync-post-close-market-data

## 1. 核心服务与 DTO 实现

- [x] 1.1 创建 `SyncPostCloseDto` 与返回类型定义（`apps/mist/src/collector/dto/sync-post-close.dto.ts`）
- [x] 1.2 实现 `PostCloseSyncService`（`apps/mist/src/collector/post-close-sync.service.ts`）：
  - 目标日期与起止时间窗口计算（利用 `TimezoneService`）
  - 证券列表筛选（ACTIVE 过滤与指定代码过滤）
  - 多数据源动态路由与 `CollectorService.collectKForSource` 调用
  - 数据就绪校验（确认返回 bar 确实包含目标交易日）
  - `Promise.allSettled` 故障隔离与结构化报告生成
- [x] 1.3 在 `HistoricalCollectorModule` 中注册并导出 `PostCloseSyncService`

## 2. Controller 与 HTTP 运维端点

- [x] 2.1 在 `CollectorController`（`apps/mist/src/collector/collector.controller.ts`）中增加 `POST /v1/collector/sync-post-close` 路由
- [x] 2.2 增加 Swagger 注解与 DTO 校验

## 3. apps/schedule 定时任务重构

- [x] 3.1 在 `DataCollectionController`（`apps/schedule/src/data-collection.controller.ts`）中注入 `PostCloseSyncService`
- [x] 3.2 增加交易日晚间 22:30 统一收盘同步任务（`@Cron('30 22 * * 1-5')`）
- [x] 3.3 在周五交易日 22:30 自动追加周线同步，月末最后一个交易日 22:30 自动追加月线同步
- [x] 3.4 清理/收敛旧的日内无效高频轮询，统一委托给 `PostCloseSyncService`

## 4. 单元测试与集成测试

- [x] 4.1 编写 `post-close-sync.service.spec.ts`：
  - 测试正常同步流程（多标的、多周期、正确计算时间范围）
  - 测试单标的抛错时的故障隔离与报告统计
  - 测试指定标的与数据源覆盖
  - 测试非交易日处理
- [x] 4.2 编写/更新 `collector.controller.spec.ts` 测试 `POST /v1/collector/sync-post-close`
- [x] 4.3 更新 `data-collection.controller.spec.ts` 覆盖 22:30 定时触发与周五/月末追加周期
- [x] 4.4 验证 `apps/schedule` 和 `apps/mist` 模块依赖与初始化

## 5. 校验与验证

- [x] 5.1 运行全局单测套件 `npm test`（11 suites / 50 tests 全绿）
- [x] 5.2 运行 TypeScript 类型检查 `npx tsc --noEmit`（0 错误）
- [x] 5.3 运行 `openspec validate --all --strict`（97 passed, 0 failed）
- [x] 5.4 验证代码格式与 `git diff --check`（无空白/格式异常）

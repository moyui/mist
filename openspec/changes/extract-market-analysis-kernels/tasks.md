## 1. 现状与契约评审

- [ ] 1.1 盘点 Indicator/Chan service、controller、DTO、entity、cross-app imports、API consumers 和 tests。
- [ ] 1.2 为现有 Indicator 与 Chan Phase A/Phase B 建立 characterization fixtures 和输出 fingerprint。
- [ ] 1.3 向项目负责人评审一个或多个 library、public exports、input/output types、invalid-input 和 numeric comparison。
  - [x] 1.3.1 确认 pure kernel 只按调用方提供的精确有限有序数组计算且不保留状态；strategy field
    catalog 负责窗口，当前 KDJ(9,3,3)=13、MACD(12,26,9)=130，crossover 由 adapter 提供相邻窗口。
    不增加 EMA/KDJ checkpoint、状态表、无限历史读取或公共 Indicator lookback 参数；V1 strategy
    不消费 `chan.*`，未来接入另开 change。
- [ ] 1.4 向项目负责人评审 Chan 公共路由长期 owner；本 change 只记录结论，不擅自删路由。
- [ ] 1.5 将接受的 contract 写回 design/specs 后，才开始移动源文件。

## 2. Indicator Kernel

- [ ] 2.1 建立 pure IndicatorCore library 和无 I/O/无 retained-state contract tests。
- [ ] 2.2 从现有 IndicatorService 分离 TypeORM/source/date adapter 与数学计算。
- [ ] 2.3 重接现有 Indicator API，并用 characterization fixtures 证明行为保持；分别固定当前 HTTP
  KDJ `period=14` 与 strategy KDJ(9,3,3) 的输入，增加 strategy KDJ 13/14 与 MACD 130/131 相邻窗口、
  调用顺序无关及 restart parity fixtures，同时证明 HTTP adapter 未被强制改用策略窗口。

## 3. Chan Kernel

- [ ] 3.1 建立 pure ChanCore library，保留现有 Phase A/Phase B 和无 persistence 语义。
- [ ] 3.2 将 DTO/entity 输入显式转换为 library-owned types，禁止 I/O 类型泄漏。
- [ ] 3.3 重接 `apps/mist` 与 `apps/chan` adapters，删除 app-to-app 业务模块 import。
- [ ] 3.4 用相同 ordered K、算法版本和 fixture 证明两个 adapter 输出等价。

## 4. 验证与交付

- [ ] 4.1 运行 Indicator/Chan 定向测试、全量 lint/typecheck/test/build 和 API contract tests。
- [ ] 4.2 检索 TypeORM/Redis/HTTP/env imports，证明 pure library 无外部 I/O。
- [ ] 4.3 执行 strict OpenSpec 和 `git diff --check`，记录路由迁移 residual work。
- [ ] 4.4 向项目负责人审阅 differential evidence 后才归档。

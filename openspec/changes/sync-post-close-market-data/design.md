# Design: sync-post-close-market-data

## 1. 架构定位与核心原则

### 1.1 架构分层
```
  [A 股收盘 15:00] -> [QMT 盘后下载 17:00~20:00+] -> [数据源/清算彻底就绪]
                                                         │
                                                         ▼
  [交易日晚间 22:30 (Cron)]  OR  [POST /v1/collector/sync-post-close (手动/周末)]
                                  │
                                  ▼
                         [PostCloseSyncService] (位于 HistoricalCollectorModule)
                                  │
         ├─ 1. 查询目标证券池 (Security.status=ACTIVE, 或指定 securityCodes)
         ├─ 2. 计算同步时间窗口 (当日 09:30~15:00 / 00:00~23:59)
         ├─ 3. 确定目标周期 (工作日: DAY, ONE_MIN; 周五追加: WEEK; 月末交易日追加: MONTH)
         ├─ 4. 多数据源路由与就绪检查 (DataSourceSelectionService / CollectionStrategyRegistry)
         │      ├── QMT (晚间 22:30 已完全同步)
         │      ├── TDX (周末手动下载后同步 / 日内有配置)
         │      └── EastMoney (备用 / 默认)
         │
         ▼ (并发安全与故障隔离: Promise.allSettled)
  [CollectorService.collectKForSource()]
         │
         ▼ (MySQL ON DUPLICATE KEY UPDATE 幂等入库)
  [MySQL K-line Table]
```

### 1.2 核心设计原则
1. **晚间 22:00+ 就绪窗口**：避开盘后数据源尚未同步的时间段，统一在交易日 22:30 执行收盘同步。
2. **不依赖 Redis 实时数据**：Redis candle 仅用于盘中实时策略，收盘后全部历史 K 线必须由权威 provider 物理抓取并写入 MySQL。
3. **数据就绪自检（Data Freshness Guard）**：抓取后验证返回的最新 K 线包含当日收盘时间，如发现源端未包含当日数据则明确标记 `NOT_READY`。
4. **幂等写入**：基于 `(security_id, period, timestamp)` 唯一键，重复触发同一天的数据同步只做 update / no-op，无副作用。
5. **故障隔离**：单只标的、单个周期的同步异常不中断其他标的或周期的执行，所有异常被记录在返回结果与日志中。
6. **时区与交易日准确性**：所有时间计算统一使用 `TimezoneService`（北京时区 UTC+8），非交易日自动跳过。

---

## 2. 详细设计

### 2.1 PostCloseSyncService
```typescript
export interface SyncPostCloseOptions {
  targetDate?: Date; // 默认当日北京时间
  periods?: Period[]; // 默认 [Period.DAY, Period.ONE_MIN]
  securityCodes?: string[]; // 默认全部 ACTIVE 标的
  sourceOverride?: DataSource; // 可选覆盖源
}

export interface SecuritySyncResult {
  code: string;
  period: Period;
  source: DataSource;
  success: boolean;
  count: number;
  error?: string;
}

export interface PostCloseSyncReport {
  targetDate: string; // YYYY-MM-DD
  totalSecurities: number;
  totalTasks: number;
  succeededTasks: number;
  failedTasks: number;
  totalKLinesSaved: number;
  durationMs: number;
  details: SecuritySyncResult[];
}
```

### 2.2 调度时间表与 Cron 表达式
- **22:30 晚间收盘权威同步**：`@Cron('30 22 * * 1-5')`（周一至周五 22:30）：
  - 核心周期：`Period.DAY` + `Period.ONE_MIN`；
  - 若为周五交易日：自动追加 `Period.WEEK`；
  - 若为月末最后一个交易日：自动追加 `Period.MONTH`。

### 2.3 HTTP 运维端点
- 路由：`POST /v1/collector/sync-post-close`
- Body DTO: `SyncPostCloseDto`
  ```typescript
  export class SyncPostCloseDto {
    @ApiPropertyOptional({ description: '目标日期 (YYYY-MM-DD)，默认为当日' })
    @IsOptional()
    @IsDateString()
    targetDate?: string;

    @ApiPropertyOptional({ description: '同步周期列表，默认为 [1440, 1]' })
    @IsOptional()
    @IsArray()
    periods?: number[];

    @ApiPropertyOptional({ description: '指定同步的股票代码列表，默认为全部活跃标的' })
    @IsOptional()
    @IsArray()
    securityCodes?: string[];

    @ApiPropertyOptional({ description: '指定数据源覆盖', enum: DataSource })
    @IsOptional()
    @IsEnum(DataSource)
    source?: DataSource;
  }
  ```

---

## 3. 错误处理与可观测性
1. **日志记录**：
   - 任务启动日志：`info: Starting post-close sync for YYYY-MM-DD, securities: N, periods: [...]`；
   - 任务完成日志：`info: Post-close sync completed: X/Y tasks succeeded, saved Z K-lines in N ms`；
   - 错误日志：`error: Post-close sync failed for 600519 (period 1m): <reason>`。
2. **HTTP 返回**：完整结构化 JSON 报告，包含成功/失败任务清单与计数。

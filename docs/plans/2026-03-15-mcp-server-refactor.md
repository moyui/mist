# MCP Server Refactor & Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all compilation errors, standardize code style, add comprehensive tests, and create complete documentation for the Mist MCP Server application.

**Architecture:** Refactor MCP Server to use correct @rekog/mcp-nest decorators (Tool with Zod schemas), import ChanModule/IndicatorModule for service reuse, create BaseMcpToolService for shared logic, add unit/E2E tests with 80%+ coverage, and document everything in a single README.md following project conventions.

**Tech Stack:**
- @rekog/mcp-nest ^1.9.7 (MCP framework for NestJS)
- @modelcontextprotocol/sdk ^1.0.4 (MCP SDK)
- NestJS ^10.0.0 (Framework)
- Zod ^4.1.0 (Schema validation)
- TypeORM ^0.3.20 (Database)
- Jest ^29.5.0 (Testing)

---

## Prerequisites

**Before starting:**
1. Read the design document: `docs/plans/2026-03-15-mcp-server-refactor-design.md`
2. Check current MCP server errors: `pnpm run start:dev:mcp-server`
3. Review existing service implementations in `apps/mist/src/chan/` and `apps/mist/src/indicator/`
4. Check @rekog/mcp-nest examples in `node_modules/@rekog/mcp-nest/README.md`

**Environment setup:**
```bash
cd /Users/xiyugao/code/mist/mist
# Ensure dependencies are installed
pnpm install
# Ensure database is running
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS mist;"
```

---

## Phase 1: Fix Critical Compilation Errors

### Task 1.1: Fix module imports in mcp-server.module.ts

**Files:**
- Modify: `apps/mcp-server/src/mcp-server.module.ts`

**Step 1: Read current file to understand issues**

Run: `cat apps/mcp-server/src/mcp-server.module.ts`
Expected: See incorrect imports like `MCPModule`, `ConfigModule as MistConfigModule`

**Step 2: Fix all import statements**

Replace the entire content with:

```typescript
import { McpModule } from '@rekog/mcp-nest';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { UtilsModule } from '@app/utils';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndexData, IndexPeriod, IndexDaily } from '@app/shared-data';
import { ChanModule } from '@app/chan/chan.module';
import { IndicatorModule } from '@app/indicator/indicator.module';
import { ChanMcpService } from './services/chan-mcp.service';
import { IndicatorMcpService } from './services/indicator-mcp.service';
import { DataMcpService } from './services/data-mcp.service';
import { ScheduleMcpService } from './services/schedule-mcp.service';
import { mcpEnvSchema } from '@app/config';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: path.join(__dirname, '.env'),
      validationSchema: mcpEnvSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    UtilsModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'mysql',
        host: configService.get('mysql_server_host', 'localhost'),
        port: configService.get('mysql_server_port', 3306),
        username: configService.get('mysql_server_username', 'root'),
        password: configService.get('mysql_server_password', ''),
        database: configService.get('mysql_server_database', 'mist'),
        synchronize: configService.get('NODE_ENV') !== 'production',
        logging: configService.get('NODE_ENV') !== 'production',
        entities: [IndexData, IndexPeriod, IndexDaily],
        poolSize: 10,
        connectorPackage: 'mysql2',
        extra: {
          authPlugins: 'sha256_password',
        },
      }),
    }),
    TypeOrmModule.forFeature([IndexData, IndexPeriod, IndexDaily]),
    ChanModule,
    IndicatorModule,
    McpModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        name: 'mist-mcp-server',
        version: '1.0.0',
        description:
          'Mist Stock Analysis MCP Server - Provides Chan Theory analysis, technical indicators, and data query tools',
        capabilities: {
          tools: {},
        },
      }),
    }),
  ],
  providers: [
    ChanMcpService,
    IndicatorMcpService,
    DataMcpService,
    ScheduleMcpService,
  ],
  exports: [],
})
export class McpServerModule {}
```

**Step 3: Verify no compilation errors from imports**

Run: `pnpm run start:dev:mcp-server 2>&1 | head -20`
Expected: No import errors for McpModule, ChanModule, IndicatorModule

**Step 4: Commit**

```bash
git add apps/mcp-server/src/mcp-server.module.ts
git commit -m "fix(mcp-server): correct module imports - use McpModule, import ChanModule/IndicatorModule"
```

---

### Task 1.2: Create directory structure

**Files:**
- Create: `apps/mcp-server/src/services/`
- Create: `apps/mcp-server/src/base/`
- Create: `apps/mcp-server/src/types/`

**Step 1: Create new directories**

Run: `mkdir -p apps/mcp-server/src/services apps/mcp-server/src/base apps/mcp-server/src/types`
Expected: Directories created successfully

**Step 2: Move existing service files to services/ directory**

Run: `mv apps/mcp-server/src/tools/*.ts apps/mcp-server/src/services/`
Expected: 4 service files moved

**Step 3: Remove empty tools/ directory**

Run: `rmdir apps/mcp-server/src/tools 2>/dev/null || true`
Expected: Directory removed or already doesn't exist

**Step 4: Commit**

```bash
git add apps/mcp-server/src/
git commit -m "refactor(mcp-server): reorganize directory structure - services/, base/, types/"
```

---

### Task 1.3: Fix chan-mcp.service.ts decorators and imports

**Files:**
- Modify: `apps/mcp-server/src/services/chan-mcp.service.ts`

**Step 1: Read current file**

Run: `cat apps/mcp-server/src/services/chan-mcp.service.ts`
Expected: See @MCPTool and @MCPToolParam decorators

**Step 2: Replace with corrected version**

Replace entire content with:

```typescript
import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { KMergeService } from '@app/chan/services/k-merge.service';
import { BiService } from '@app/chan/services/bi.service';
import { ChannelService } from '@app/chan/services/channel.service';

/**
 * Zod schema for K-line data
 */
const KLineSchema = z.array(z.object({
  id: z.number(),
  time: z.string(),
  open: z.number(),
  close: z.number(),
  highest: z.number(),
  lowest: z.number(),
  volume: z.number(),
  price: z.number(),
}));

/**
 * Zod schema for Bi data
 */
const BiSchema = z.array(z.object({
  id: z.number(),
  trend: z.enum(['UP', 'DOWN']),
  startId: z.number(),
  endId: z.number(),
  highest: z.number(),
  lowest: z.number(),
}));

/**
 * MCP Service for Chan Theory (缠论) Analysis
 */
@Injectable()
export class ChanMcpService {
  constructor(
    private readonly kMergeService: KMergeService,
    private readonly biService: BiService,
    private readonly channelService: ChannelService,
  ) {}

  @Tool({
    name: 'merge_k',
    description: '合并K线，基于包含关系和趋势方向将连续K线分组',
  })
  async mergeK(k: z.infer<typeof KLineSchema>) {
    const result = await this.kMergeService.merge(k);
    return {
      success: true,
      data: result,
      count: result.length,
    };
  }

  @Tool({
    name: 'create_bi',
    description: '从K线数据中识别笔（Bi），基于缠论分型识别',
  })
  async createBi(k: z.infer<typeof KLineSchema>) {
    const createBiDto = { k };
    const result = await this.biService.createBi(createBiDto);
    return {
      success: true,
      data: result,
      count: result.length,
    };
  }

  @Tool({
    name: 'get_fenxing',
    description: '获取所有分型（Fenxing），识别顶分型和底分型',
  })
  async getFenxing(k: z.infer<typeof KLineSchema>) {
    const createBiDto = { k };
    const result = await this.biService.getFenxings(createBiDto);
    return {
      success: true,
      data: result,
      count: result.length,
    };
  }

  @Tool({
    name: 'create_channel',
    description: '从笔（Bi）数据中识别中枢（Channel/Zhongshu）',
  })
  async createChannel(bis: z.infer<typeof BiSchema>) {
    const createChannelDto = { bis };
    const result = await this.channelService.createChannel(createChannelDto);
    return {
      success: true,
      data: result,
      count: result.length,
    };
  }

  @Tool({
    name: 'analyze_chan_theory',
    description: '完整的缠论分析：合并K → 识别笔 → 识别分型 → 识别中枢',
  })
  async analyzeChanTheory(k: z.infer<typeof KLineSchema>) {
    // Step 1: Merge K
    const mergedK = await this.kMergeService.merge(k);

    // Step 2: Create Bi
    const createBiDto = { k: mergedK };
    const bis = await this.biService.createBi(createBiDto);

    // Step 3: Get Fenxings
    const fenxings = await this.biService.getFenxings(createBiDto);

    // Step 4: Create Channels
    const createChannelDto = { bis };
    const channels = await this.channelService.createChannel(createChannelDto);

    return {
      success: true,
      data: {
        mergedK: {
          count: mergedK.length,
          data: mergedK,
        },
        bis: {
          count: bis.length,
          data: bis,
        },
        fenxings: {
          count: fenxings.length,
          data: fenxings,
        },
        channels: {
          count: channels.length,
          data: channels,
        },
      },
      summary: {
        originalKLines: k.length,
        mergedKLines: mergedK.length,
        bisCount: bis.length,
        fenxingsCount: fenxings.length,
        channelsCount: channels.length,
      },
    };
  }
}
```

**Step 3: Verify no decorator errors**

Run: `pnpm run start:dev:mcp-server 2>&1 | grep -A5 "chan-mcp" | head -10`
Expected: No decorator-related errors

**Step 4: Commit**

```bash
git add apps/mcp-server/src/services/chan-mcp.service.ts
git commit -m "fix(mcp-server): update ChanMcpService to use Tool decorator with Zod schemas"
```

---

### Task 1.4: Fix indicator-mcp.service.ts decorators

**Files:**
- Modify: `apps/mcp-server/src/services/indicator-mcp.service.ts`

**Step 1: Read current file**

Run: `cat apps/mcp-server/src/services/indicator-mcp.service.ts | head -50`
Expected: See @MCPTool decorators

**Step 2: Replace with corrected version**

Replace entire content with:

```typescript
import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { IndicatorService } from '@app/indicator/indicator.service';

// Zod schemas
const PricesSchema = z.array(z.number());

@Injectable()
export class IndicatorMcpService {
  constructor(private readonly indicatorService: IndicatorService) {}

  @Tool({
    name: 'calculate_macd',
    description: '计算MACD指标（移动平均收敛发散）',
  })
  async calculateMacd(prices: z.infer<typeof PricesSchema>) {
    const result = await this.indicatorService.runMACD(prices);
    return {
      success: true,
      data: result,
      params: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      },
    };
  }

  @Tool({
    name: 'calculate_rsi',
    description: '计算RSI指标（相对强弱指数）',
  })
  async calculateRsi(
    prices: z.infer<typeof PricesSchema>,
    period: number = 14,
  ) {
    const result = await this.indicatorService.runRSI(prices, period);
    return {
      success: true,
      data: result,
      params: { period },
    };
  }

  @Tool({
    name: 'calculate_kdj',
    description: '计算KDJ指标（随机振荡器）',
  })
  async calculateKdj(
    highs: z.infer<typeof PricesSchema>,
    lows: z.infer<typeof PricesSchema>,
    closes: z.infer<typeof PricesSchema>,
    period: number = 9,
    kSmoothing: number = 3,
    dSmoothing: number = 3,
  ) {
    const result = await this.indicatorService.runKDJ({
      high: highs,
      low: lows,
      close: closes,
      period,
      kSmoothing,
      dSmoothing,
    });
    return {
      success: true,
      data: result,
      params: { period, kSmoothing, dSmoothing },
    };
  }

  @Tool({
    name: 'calculate_adx',
    description: '计算ADX指标（平均趋向指数）',
  })
  async calculateAdx(
    highs: z.infer<typeof PricesSchema>,
    lows: z.infer<typeof PricesSchema>,
    closes: z.infer<typeof PricesSchema>,
    period: number = 14,
  ) {
    const result = await this.indicatorService.runADX({
      high: highs,
      low: lows,
      close: closes,
      period,
    });
    return {
      success: true,
      data: result,
      params: { period },
    };
  }

  @Tool({
    name: 'calculate_atr',
    description: '计算ATR指标（平均真实波幅）',
  })
  async calculateAtr(
    highs: z.infer<typeof PricesSchema>,
    lows: z.infer<typeof PricesSchema>,
    closes: z.infer<typeof PricesSchema>,
    period: number = 14,
  ) {
    const result = await this.indicatorService.runATR({
      high: highs,
      low: lows,
      close: closes,
      period,
    });
    return {
      success: true,
      data: result,
      params: { period },
    };
  }

  @Tool({
    name: 'analyze_indicators',
    description: '完整的技术指标分析：MACD、RSI、KDJ、ADX、ATR',
  })
  async analyzeIndicators(
    highs: z.infer<typeof PricesSchema>,
    lows: z.infer<typeof PricesSchema>,
    closes: z.infer<typeof PricesSchema>,
  ) {
    const [macd, rsi, kdj, adx, atr] = await Promise.all([
      this.indicatorService.runMACD(closes),
      this.indicatorService.runRSI(closes),
      this.indicatorService.runKDJ({ high: highs, low: lows, close: closes }),
      this.indicatorService.runADX({ high: highs, low: lows, close: closes }),
      this.indicatorService.runATR({ high: highs, low: lows, close: closes }),
    ]);

    return {
      success: true,
      data: {
        macd: { nbElement: macd.nbElement, data: macd },
        rsi: { nbElement: rsi.nbElement, data: rsi },
        kdj: { nbElement: kdj.nbElement, data: kdj },
        adx: { count: adx.length, data: adx },
        atr: { count: atr.length, data: atr },
      },
      summary: {
        candleCount: closes.length,
        indicatorsCalculated: 5,
      },
    };
  }
}
```

**Step 3: Verify no errors**

Run: `pnpm run start:dev:mcp-server 2>&1 | grep -i "indicator" | head -10`
Expected: No indicator-related errors

**Step 4: Commit**

```bash
git add apps/mcp-server/src/services/indicator-mcp.service.ts
git commit -m "fix(mcp-server): update IndicatorMcpService to use Tool decorator with Zod schemas"
```

---

### Task 1.5: Fix data-mcp.service.ts decorators

**Files:**
- Modify: `apps/mcp-server/src/services/data-mcp.service.ts`

**Step 1: Replace with corrected version**

Replace entire content with:

```typescript
import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IndexData } from '@app/shared-data';
import { IndexPeriod } from '@app/shared-data';
import { IndexDaily } from '@app/shared-data';

// Zod schemas
const PeriodEnum = z.enum(['ONE', 'FIVE', 'FIFTEEN', 'THIRTY', 'SIXTY']);

@Injectable()
export class DataMcpService {
  constructor(
    @InjectRepository(IndexData)
    private readonly indexDataRepository: Repository<IndexData>,
    @InjectRepository(IndexPeriod)
    private readonly indexPeriodRepository: Repository<IndexPeriod>,
    @InjectRepository(IndexDaily)
    private readonly indexDailyRepository: Repository<IndexDaily>,
  ) {}

  @Tool({
    name: 'get_index_info',
    description: '根据代码获取指数信息',
  })
  async getIndexInfo(symbol: string) {
    const index = await this.indexDataRepository.findOne({
      where: { symbol },
    });

    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
    }

    return {
      success: true,
      data: {
        id: index.id,
        symbol: index.symbol,
        name: index.name,
        type: index.type,
      },
    };
  }

  @Tool({
    name: 'get_kline_data',
    description: '获取K线数据（分时数据）',
  })
  async getKlineData(
    symbol: string,
    period: z.infer<typeof PeriodEnum>,
    limit: number = 100,
    startTime?: string,
    endTime?: string,
  ) {
    const index = await this.indexDataRepository.findOne({ where: { symbol } });
    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
    }

    const queryBuilder = this.indexPeriodRepository
      .createQueryBuilder('ip')
      .where('ip.index_id = :indexId', { indexId: index.id })
      .andWhere('ip.type = :period', { period })
      .orderBy('ip.time', 'DESC')
      .limit(limit);

    if (startTime) {
      queryBuilder.andWhere('ip.time >= :startTime', { startTime });
    }
    if (endTime) {
      queryBuilder.andWhere('ip.time <= :endTime', { endTime });
    }

    const data = await queryBuilder.getMany();

    return {
      success: true,
      data: data.map((item) => ({
        id: item.id,
        time: item.time,
        open: item.open,
        close: item.close,
        highest: item.highest,
        lowest: item.lowest,
        volume: item.volume,
        price: item.price,
      })),
      count: data.length,
      params: { symbol, period, limit },
    };
  }

  @Tool({
    name: 'get_daily_kline',
    description: '获取日线K线数据',
  })
  async getDailyKline(
    symbol: string,
    limit: number = 100,
    startDate?: string,
    endDate?: string,
  ) {
    const index = await this.indexDataRepository.findOne({ where: { symbol } });
    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
    }

    const queryBuilder = this.indexDailyRepository
      .createQueryBuilder('id')
      .where('id.index_id = :indexId', { indexId: index.id })
      .orderBy('id.time', 'DESC')
      .limit(limit);

    if (startDate) {
      queryBuilder.andWhere('id.time >= :startDate', { startDate });
    }
    if (endDate) {
      queryBuilder.andWhere('id.time <= :endDate', { endDate });
    }

    const data = await queryBuilder.getMany();

    return {
      success: true,
      data: data.map((item) => ({
        id: item.id,
        time: item.time,
        open: item.open,
        close: item.close,
        highest: item.highest,
        lowest: item.lowest,
        volume: item.volume,
        price: item.price,
        turnoverRate: item.turnoverRate,
      })),
      count: data.length,
      params: { symbol, limit },
    };
  }

  @Tool({
    name: 'list_indices',
    description: '获取所有可用的指数列表',
  })
  async listIndices() {
    const indices = await this.indexDataRepository.find({
      select: ['id', 'symbol', 'name', 'type'],
    });
    return {
      success: true,
      data: indices,
      count: indices.length,
    };
  }

  @Tool({
    name: 'get_latest_data',
    description: '获取指数的最新数据（所有周期）',
  })
  async getLatestData(symbol: string) {
    const index = await this.indexDataRepository.findOne({ where: { symbol } });
    if (!index) {
      return {
        success: false,
        error: `Index with symbol ${symbol} not found`,
      };
    }

    const periods: ('ONE' | 'FIVE' | 'FIFTEEN' | 'THIRTY' | 'SIXTY')[] = [
      'ONE',
      'FIVE',
      'FIFTEEN',
      'THIRTY',
      'SIXTY',
    ];

    const [dailyData, ...periodData] = await Promise.all([
      this.indexDailyRepository
        .createQueryBuilder('id')
        .where('id.index_id = :indexId', { indexId: index.id })
        .orderBy('id.time', 'DESC')
        .limit(1)
        .getOne(),
      ...periods.map((period) =>
        this.indexPeriodRepository
          .createQueryBuilder('ip')
          .where('ip.index_id = :indexId', { indexId: index.id })
          .andWhere('ip.type = :period', { period })
          .orderBy('ip.time', 'DESC')
          .limit(1)
          .getOne(),
      ),
    ]);

    return {
      success: true,
      data: {
        symbol,
        name: index.name,
        daily: dailyData,
        '1min': periodData[0],
        '5min': periodData[1],
        '15min': periodData[2],
        '30min': periodData[3],
        '60min': periodData[4],
      },
    };
  }
}
```

**Step 2: Verify no errors**

Run: `pnpm run start:dev:mcp-server 2>&1 | grep -i "data" | head -10`
Expected: No data service errors

**Step 3: Commit**

```bash
git add apps/mcp-server/src/services/data-mcp.service.ts
git commit -m "fix(mcp-server): update DataMcpService to use Tool decorator with Zod schemas"
```

---

### Task 1.6: Fix schedule-mcp.service.ts decorators

**Files:**
- Modify: `apps/mcp-server/src/services/schedule-mcp.service.ts`

**Step 1: Replace with corrected version**

Replace entire content with:

```typescript
import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { SchedulerRegistry } from '@nestjs/schedule';

// Zod schemas
const PeriodEnum = z.enum(['ONE', 'FIVE', 'FIFTEEN', 'THIRTY', 'SIXTY', 'DAILY']);

@Injectable()
export class ScheduleMcpService {
  constructor(private readonly schedulerRegistry: SchedulerRegistry) {}

  @Tool({
    name: 'trigger_data_collection',
    description: '触发数据采集任务',
  })
  async triggerDataCollection(
    symbol: string,
    period: z.infer<typeof PeriodEnum>,
  ) {
    // PoC implementation
    return {
      success: true,
      message: `Data collection triggered for ${symbol} (${period})`,
      data: {
        symbol,
        period,
        triggeredAt: new Date().toISOString(),
        status: 'queued',
        jobId: `job_${Date.now()}`,
      },
    };
  }

  @Tool({
    name: 'list_scheduled_jobs',
    description: '列出所有定时任务',
  })
  async listScheduledJobs() {
    const jobs = this.schedulerRegistry.getCronJobs();
    const jobList = Array.from(jobs.entries()).map(([name, job]) => ({
      name,
      nextExecution: job?.next?.toDate?.()?.toISOString(),
      running: job?.running ?? false,
    }));

    return {
      success: true,
      data: jobList,
      count: jobList.length,
    };
  }

  @Tool({
    name: 'get_job_status',
    description: '获取定时任务状态',
  })
  async getJobStatus(jobName: string) {
    try {
      const job = this.schedulerRegistry.getCronJob(jobName);

      if (!job) {
        return {
          success: false,
          error: `Job ${jobName} not found`,
        };
      }

      return {
        success: true,
        data: {
          name: jobName,
          running: job.running,
          nextExecution: job?.next?.toDate?.()?.toISOString(),
          lastExecution: job?.lastDate?.()?.toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  @Tool({
    name: 'trigger_batch_collection',
    description: '批量触发数据采集',
  })
  async triggerBatchCollection(
    symbols: string[],
    periods: z.infer<typeof z.array(PeriodEnum)>,
  ) {
    const tasks = [];
    for (const symbol of symbols) {
      for (const period of periods) {
        tasks.push({ symbol, period });
      }
    }

    return {
      success: true,
      message: `Batch data collection triggered for ${tasks.length} tasks`,
      data: {
        taskCount: tasks.length,
        triggeredAt: new Date().toISOString(),
        status: 'queued',
        tasks: tasks.slice(0, 10),
        batchId: `batch_${Date.now()}`,
      },
    };
  }

  @Tool({
    name: 'get_schedule_config',
    description: '获取数据采集计划配置',
  })
  async getScheduleConfig() {
    return {
      success: true,
      data: {
        description: 'Mist 数据采集计划配置',
        schedules: [
          {
            name: '日线数据采集',
            period: 'DAILY',
            cron: '0 17 * * 1-5',
            description: '每个工作日下午5点采集日线数据',
          },
          {
            name: '1分钟数据采集',
            period: 'ONE',
            cron: '*/1 * 9-15 * * 1-5',
            description: '交易时间内每分钟采集一次',
          },
          {
            name: '5分钟数据采集',
            period: 'FIVE',
            cron: '*/5 * 9-15 * * 1-5',
            description: '交易时间内每5分钟采集一次',
          },
          {
            name: '15分钟数据采集',
            period: 'FIFTEEN',
            cron: '*/15 * 9-15 * * 1-5',
            description: '交易时间内每15分钟采集一次',
          },
          {
            name: '30分钟数据采集',
            period: 'THIRTY',
            cron: '*/30 * 9-15 * * 1-5',
            description: '交易时间内每30分钟采集一次',
          },
          {
            name: '60分钟数据采集',
            period: 'SIXTY',
            cron: '0 * 9-15 * * 1-5',
            description: '交易时间内每小时采集一次',
          },
        ],
      },
    };
  }
}
```

**Step 2: Verify no errors**

Run: `pnpm run start:dev:mcp-server 2>&1 | grep -i "schedule" | head -10`
Expected: No schedule service errors

**Step 3: Commit**

```bash
git add apps/mcp-server/src/services/schedule-mcp.service.ts
git commit -m "fix(mcp-server): update ScheduleMcpService to use Tool decorator with Zod schemas"
```

---

### Task 1.7: Verify server starts without errors

**Files:**
- Verify: `apps/mcp-server/src/main.ts`

**Step 1: Check main.ts is correct**

Run: `cat apps/mcp-server/src/main.ts`
Expected: Uses NestFactory.createApplicationContext

**Step 2: Try starting the server**

Run: `timeout 10 pnpm run start:dev:mcp-server 2>&1 || true`
Expected Output: Server starts successfully or shows initialization logs without compilation errors

**Step 3: Check if there are any remaining errors**

Run: `pnpm run start:dev:mcp-server 2>&1 | grep -i "error\|cannot" | head -20`
Expected: No errors

**Step 4: Commit if any main.ts changes were needed**

```bash
git add apps/mcp-server/src/main.ts
git commit -m "fix(mcp-server): ensure main.ts uses ApplicationContext for MCP server"
```

**Step 5: Mark Phase 1 complete**

Run: `echo "Phase 1 complete: All critical errors fixed" > /tmp/mcp-phase1-complete.txt`
Expected: Phase 1 completion marker created

---

## Phase 2: Architecture & Code Style

### Task 2.1: Create BaseMcpToolService base class

**Files:**
- Create: `apps/mcp-server/src/base/base-mcp-tool.service.ts`

**Step 1: Create the base service file**

```typescript
import { Logger } from '@nestjs/common';

export abstract class BaseMcpToolService {
  protected readonly logger: Logger;

  constructor(name: string) {
    this.logger = new Logger(name);
  }

  /**
   * 统一的成功响应格式
   */
  protected success<T>(data: T, meta?: Record<string, any>) {
    return {
      success: true,
      data,
      ...meta,
    };
  }

  /**
   * 统一的错误响应格式（符合 MCP 协议）
   */
  protected error(message: string, code?: string) {
    return {
      success: false,
      error: {
        message,
        code,
      },
    };
  }

  /**
   * 包装工具执行，自动处理日志和错误
   */
  protected async executeTool<T>(
    toolName: string,
    fn: () => Promise<T>,
  ): Promise<{ success: true; data: T } | { success: false; error: { message: string; code?: string } }> {
    this.logger.debug(`Executing tool: ${toolName}`);
    try {
      const result = await fn();
      this.logger.debug(`Tool ${toolName} completed successfully`);
      return this.success(result);
    } catch (error) {
      this.logger.error(`Tool ${toolName} failed:`, error.message);
      return this.error(error.message, error.code);
    }
  }
}
```

**Step 2: Verify file created**

Run: `ls -la apps/mcp-server/src/base/`
Expected: base-mcp-tool.service.ts exists

**Step 3: Commit**

```bash
git add apps/mcp-server/src/base/base-mcp-tool.service.ts
git commit -m "feat(mcp-server): create BaseMcpToolService with common logic for response handling and error management"
```

---

### Task 2.2: Update ChanMcpService to extend BaseMcpToolService

**Files:**
- Modify: `apps/mcp-server/src/services/chan-mcp.service.ts`

**Step 1: Add base class import and extend**

Add import and change class declaration:

```typescript
import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { KMergeService } from '@app/chan/services/k-merge.service';
import { BiService } from '@app/chan/services/bi.service';
import { ChannelService } from '@app/chan/services/channel.service';
import { BaseMcpToolService } from '../base/base-mcp-tool.service';

// Zod schemas remain the same...

@Injectable()
export class ChanMcpService extends BaseMcpToolService {
  constructor(
    private readonly kMergeService: KMergeService,
    private readonly biService: BiService,
    private readonly channelService: ChannelService,
  ) {
    super(ChanMcpService.name);
  }

  @Tool({
    name: 'merge_k',
    description: '合并K线，基于包含关系和趋势方向将连续K线分组',
  })
  async mergeK(k: z.infer<typeof KLineSchema>) {
    return this.executeTool('merge_k', async () => {
      const result = await this.kMergeService.merge(k);
      return { data: result, count: result.length };
    });
  }

  // Update other methods similarly...
}
```

**Step 2: Verify no errors**

Run: `pnpm run start:dev:mcp-server 2>&1 | grep -i "chan" | head -10`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/mcp-server/src/services/chan-mcp.service.ts
git commit -m "refactor(mcp-server): ChanMcpService extends BaseMcpToolService"
```

---

### Task 2.3: Update remaining services to extend BaseMcpToolService

**Files:**
- Modify: `apps/mcp-server/src/services/indicator-mcp.service.ts`
- Modify: `apps/mcp-server/src/services/data-mcp.service.ts`
- Modify: `apps/mcp-server/src/services/schedule-mcp.service.ts`

**Step 1: Update IndicatorMcpService**

For each tool method, wrap the logic with executeTool:

```typescript
import { BaseMcpToolService } from '../base/base-mcp-tool.service';

@Injectable()
export class IndicatorMcpService extends BaseMcpToolService {
  constructor(private readonly indicatorService: IndicatorService) {
    super(IndicatorMcpService.name);
  }

  @Tool({
    name: 'calculate_macd',
    description: '计算MACD指标（移动平均收敛发散）',
  })
  async calculateMacd(prices: z.infer<typeof PricesSchema>) {
    return this.executeTool('calculate_macd', async () => {
      const result = await this.indicatorService.runMACD(prices);
      return {
        data: result,
        params: {
          fastPeriod: 12,
          slowPeriod: 26,
          signalPeriod: 9,
        },
      };
    });
  }

  // Update other methods similarly...
}
```

**Step 2: Update DataMcpService and ScheduleMcpService**

Follow the same pattern for each service.

**Step 3: Verify all services compile**

Run: `pnpm run start:dev:mcp-server 2>&1 | grep -E "error|Error" | head -20`
Expected: No errors

**Step 4: Commit all service updates**

```bash
git add apps/mcp-server/src/services/
git commit -m "refactor(mcp-server): all MCP services extend BaseMcpToolService"
```

---

## Phase 3: Testing

### Task 3.1: Create unit test for ChanMcpService

**Files:**
- Create: `apps/mcp-server/src/services/chan-mcp.service.spec.ts`

**Step 1: Write the test file**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ChanMcpService } from './chan-mcp.service';
import { KMergeService } from '@app/chan/services/k-merge.service';
import { BiService } from '@app/chan/services/bi.service';
import { ChannelService } from '@app/chan/services/channel.service';

describe('ChanMcpService', () => {
  let service: ChanMcpService;
  let kMergeService: jest.Mocked<KMergeService>;
  let biService: jest.Mocked<BiService>;
  let channelService: jest.Mocked<ChannelService>;

  const mockKLine = [
    {
      id: 1,
      time: '2024-01-01 09:30:00',
      open: 100,
      close: 102,
      highest: 103,
      lowest: 99,
      volume: 1000,
      price: 102,
    },
    {
      id: 2,
      time: '2024-01-01 09:31:00',
      open: 102,
      close: 101,
      highest: 104,
      lowest: 100,
      volume: 1200,
      price: 101,
    },
  ];

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChanMcpService,
        {
          provide: KMergeService,
          useValue: {
            merge: jest.fn(),
          },
        },
        {
          provide: BiService,
          useValue: {
            createBi: jest.fn(),
            getFenxings: jest.fn(),
          },
        },
        {
          provide: ChannelService,
          useValue: {
            createChannel: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ChanMcpService>(ChanMcpService);
    kMergeService = module.get(KMergeService);
    biService = module.get(BiService);
    channelService = module.get(ChannelService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('merge_k', () => {
    it('should merge K-lines successfully', async () => {
      const expectedResult = [mockKLine[0]];
      kMergeService.merge.mockResolvedValue(expectedResult);

      const result = await service.mergeK(mockKLine);

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
      expect(kMergeService.merge).toHaveBeenCalledWith(mockKLine);
    });

    it('should handle merge errors', async () => {
      kMergeService.merge.mockRejectedValue(new Error('Merge failed'));

      const result = await service.mergeK(mockKLine);

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Merge failed');
    });
  });

  describe('create_bi', () => {
    it('should create Bi from K-lines', async () => {
      const expectedBi = [
        {
          id: 1,
          trend: 'UP' as const,
          startId: 1,
          endId: 2,
          highest: 103,
          lowest: 99,
        },
      ];
      biService.createBi.mockResolvedValue(expectedBi);

      const result = await service.createBi(mockKLine);

      expect(result.success).toBe(true);
      expect(result.data.count).toBe(1);
    });
  });

  describe('analyze_chan_theory', () => {
    it('should perform complete Chan Theory analysis', async () => {
      const mockMergedK = [mockKLine[0]];
      const mockBi = [
        { id: 1, trend: 'UP' as const, startId: 1, endId: 1, highest: 103, lowest: 99 },
      ];
      const mockFenxings = [{ id: 1, type: 'TOP' as const }];
      const mockChannels = [{ id: 1, zg: 105, zd: 100 }];

      kMergeService.merge.mockResolvedValue(mockMergedK);
      biService.createBi.mockResolvedValue(mockBi);
      biService.getFenxings.mockResolvedValue(mockFenxings);
      channelService.createChannel.mockResolvedValue(mockChannels);

      const result = await service.analyzeChanTheory(mockKLine);

      expect(result.success).toBe(true);
      expect(result.data.summary.originalKLines).toBe(2);
      expect(result.data.summary.bisCount).toBe(1);
      expect(result.data.summary.channelsCount).toBe(1);
    });
  });
});
```

**Step 2: Run the test**

Run: `pnpm test chan-mcp.service.spec`
Expected: Tests pass or fail with clear messages

**Step 3: Commit**

```bash
git add apps/mcp-server/src/services/chan-mcp.service.spec.ts
git commit -m "test(mcp-server): add unit tests for ChanMcpService"
```

---

### Task 3.2: Create unit tests for remaining services

**Files:**
- Create: `apps/mcp-server/src/services/indicator-mcp.service.spec.ts`
- Create: `apps/mcp-server/src/services/data-mcp.service.spec.ts`
- Create: `apps/mcp-server/src/services/schedule-mcp.service.spec.ts`

**Step 1: Create indicator-mcp.service.spec.ts**

Follow the same pattern as ChanMcpService tests:
- Mock IndicatorService
- Test each tool method
- Test success and error cases

**Step 2: Create data-mcp.service.spec.ts**

- Mock repositories (IndexData, IndexPeriod, IndexDaily)
- Test each data query method
- Test error cases (index not found)

**Step 3: Create schedule-mcp.service.spec.ts**

- Mock SchedulerRegistry
- Test schedule management methods

**Step 4: Run all unit tests**

Run: `pnpm test -- apps/mcp-server`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/mcp-server/src/services/
git commit -m "test(mcp-server): add unit tests for IndicatorMcpService, DataMcpService, ScheduleMcpService"
```

---

### Task 3.3: Create E2E test configuration

**Files:**
- Create: `apps/mcp-server/test/jest-e2e.json`
- Create: `apps/mcp-server/test/mcp-server.e2e-spec.ts`

**Step 1: Create jest-e2e.json**

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  }
}
```

**Step 2: Create mcp-server.e2e-spec.ts**

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { McpServerModule } from './../src/mcp-server.module';
import { INestApplication } from '@nestjs/common';

describe('MCP Server E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [McpServerModule],
    }).compile();

    app = moduleFixture.createNestApplicationContext();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should start MCP server without errors', () => {
    expect(app).toBeDefined();
  });

  it('should register all MCP tool services', async () => {
    // Verify services are available
    const services = ['ChanMcpService', 'IndicatorMcpService', 'DataMcpService', 'ScheduleMcpService'];

    for (const serviceName of services) {
      const service = app.get(serviceName);
      expect(service).toBeDefined();
    }
  });
});
```

**Step 3: Run E2E test**

Run: `pnpm test --config ./apps/mcp-server/test/jest-e2e.json`
Expected: E2E tests pass

**Step 4: Commit**

```bash
git add apps/mcp-server/test/
git commit -m "test(mcp-server): add E2E test configuration and basic E2E tests"
```

---

### Task 3.4: Add test scripts to package.json

**Files:**
- Modify: `package.json`

**Step 1: Add test scripts**

Add to the scripts section:

```json
"test:mcp-server": "jest mcp-server",
"test:mcp-server:e2e": "jest --config ./apps/mcp-server/test/jest-e2e.json",
"test:mcp-server:watch": "jest mcp-server --watch",
"test:mcp-server:cov": "jest mcp-server --coverage"
```

**Step 2: Run test commands to verify**

Run: `pnpm run test:mcp-server 2>&1 | tail -20`
Expected: Tests run successfully

**Step 3: Check coverage**

Run: `pnpm run test:mcp-server:cov 2>&1 | tail -30`
Expected: Coverage report shown

**Step 4: Commit**

```bash
git add package.json
git commit -m "test(mcp-server): add test scripts to package.json"
```

---

## Phase 4: Documentation

### Task 4.1: Create comprehensive README.md

**Files:**
- Modify: `apps/mcp-server/README.md`

**Step 1: Create full README.md**

Following the pattern from `apps/chan/README.md`, create:

```markdown
# Mist MCP Server

MCP (Model Context Protocol) server for Mist Stock Analysis System - provides Chan Theory analysis, technical indicators, and data query tools for AI assistants.

## Overview

This MCP server exposes Mist's stock analysis capabilities through the Model Context Protocol, enabling AI assistants (like Claude) to:
- Perform Chan Theory analysis (Merge K, Bi, Channels)
- Calculate technical indicators (MACD, RSI, KDJ, ADX, ATR)
- Query stock market data from database
- Manage scheduled data collection tasks

## Installation

\`\`\`bash
# Install dependencies
cd mist
pnpm install

# Setup environment
cp apps/mcp-server/.env.example apps/mcp-server/.env
# Edit .env with your database credentials
\`\`\`

## Usage

### Starting the Server

\`\`\`bash
# Development mode
pnpm run start:dev:mcp-server

# Production mode
pnpm run build
node dist/apps/mcp-server/main.js
\`\`\`

The server runs on **stdio** by default, suitable for MCP client communication.

### Available Tools

#### Chan Theory Tools (5 tools)

1. **merge_k** - Merge K-lines based on containment relationships
   - Input: Array of K-line objects (id, time, open, close, highest, lowest, volume, price)
   - Output: Merged K-lines with count

2. **create_bi** - Identify Bi (trend lines) from K-lines
   - Input: Array of K-line objects
   - Output: Bi array with trend, start/end points, price levels

3. **get_fenxing** - Get all fractals (top/bottom patterns)
   - Input: Array of K-line objects
   - Output: Fenxing array with type and location

4. **create_channel** - Identify channels (consolidation zones)
   - Input: Array of Bi objects
   - Output: Channel array with zg, zd, extension info

5. **analyze_chan_theory** - Complete Chan Theory analysis pipeline
   - Input: Array of K-line objects
   - Output: Merged K, Bis, Fenxings, Channels with summary

#### Technical Indicator Tools (6 tools)

1. **calculate_macd** - Calculate MACD indicator
   - Input: Array of closing prices
   - Output: MACD line, signal line, histogram

2. **calculate_rsi** - Calculate RSI indicator
   - Input: Array of closing prices, period (default: 14)
   - Output: RSI values

3. **calculate_kdj** - Calculate KDJ indicator
   - Input: Arrays of highs, lows, closes + parameters
   - Output: K, D, J lines

4. **calculate_adx** - Calculate ADX indicator
   - Input: Arrays of highs, lows, closes + period
   - Output: ADX values

5. **calculate_atr** - Calculate ATR indicator
   - Input: Arrays of highs, lows, closes + period
   - Output: ATR values

6. **analyze_indicators** - Complete indicator analysis
   - Input: Arrays of highs, lows, closes
   - Output: MACD, RSI, KDJ, ADX, ATR results

#### Data Query Tools (5 tools)

1. **get_index_info** - Get index information by symbol
   - Input: Symbol (e.g., "000001")
   - Output: Index name, type, ID

2. **get_kline_data** - Get intraday K-line data
   - Input: Symbol, period (ONE/FIVE/FIFTEEN/THIRTY/SIXTY), limit, optional time range
   - Output: K-line array with count

3. **get_daily_kline** - Get daily K-line data
   - Input: Symbol, limit, optional date range
   - Output: Daily K-line array with count

4. **list_indices** - List all available indices
   - Input: None
   - Output: Array of all indices with symbols and names

5. **get_latest_data** - Get latest data for all periods
   - Input: Symbol
   - Output: Latest data for daily, 1min, 5min, 15min, 30min, 60min

#### Schedule Management Tools (5 tools)

1. **trigger_data_collection** - Trigger manual data collection
   - Input: Symbol, period
   - Output: Job status with job ID

2. **list_scheduled_jobs** - List all scheduled jobs
   - Input: None
   - Output: Array of jobs with next execution time

3. **get_job_status** - Get specific job status
   - Input: Job name
   - Output: Job running status, next/last execution

4. **trigger_batch_collection** - Batch trigger data collection
   - Input: Array of symbols, array of periods
   - Output: Batch job status with task count

5. **get_schedule_config** - Get schedule configuration
   - Input: None
   - Output: Schedule configuration for all periods

## MCP Client Configuration

Add to your MCP client configuration (e.g., Claude Desktop):

\`\`\`json
{
  "mcpServers": {
    "mist": {
      "command": "node",
      "args": ["/path/to/mist/dist/apps/mcp-server/main.js"],
      "env": {
        "PORT": "8009",
        "mysql_server_host": "localhost",
        "mysql_server_port": "3306",
        "mysql_server_username": "root",
        "mysql_server_password": "password",
        "mysql_server_database": "mist"
      }
    }
  }
}
\`\`\`

## Testing

\`\`\`bash
# Unit tests
pnpm run test:mcp-server

# E2E tests
pnpm run test:mcp-server:e2e

# Watch mode
pnpm run test:mcp-server:watch

# Coverage
pnpm run test:mcp-server:cov
\`\`\`

## Architecture

\`\`\`
apps/mcp-server/
├── src/
│   ├── main.ts                        # Application entry (ApplicationContext)
│   ├── mcp-server.module.ts           # Root module
│   ├── services/                      # MCP tool services
│   │   ├── chan-mcp.service.ts
│   │   ├── indicator-mcp.service.ts
│   │   ├── data-mcp.service.ts
│   │   └── schedule-mcp.service.ts
│   ├── base/                          # Shared base classes
│   │   └── base-mcp-tool.service.ts
│   └── types/                         # Type definitions
├── test/                              # E2E tests
│   └── mcp-server.e2e-spec.ts
├── .env                               # Environment configuration
└── README.md
\`\`\`

## Troubleshooting

### Server fails to start

**Error:** `Module not found: Can't resolve '../../mist/src/chan/services'`

**Solution:** Ensure ChanModule is properly imported in mcp-server.module.ts
\`\`\`typescript
import { ChanModule } from '@app/chan/chan.module';
\`\`\`

### Database connection errors

**Error:** `Access denied for user 'root'@'localhost'`

**Solution:** Check .env file credentials
\`\`\`bash
mysql_server_host=localhost
mysql_server_port=3306
mysql_server_username=root
mysql_server_password=your_password
mysql_server_database=mist
\`\`\`

### MCP tools not registered

**Error:** Tools not appearing in MCP client

**Solution:**
1. Check that services are decorated with @Tool()
2. Verify services are listed in McpServerModule providers
3. Check server logs for registration errors

### TypeORM errors

**Error:** `Entity metadata not found`

**Solution:** Ensure entities are imported in TypeOrmModule.forFeature()
\`\`\`typescript
TypeOrmModule.forFeature([IndexData, IndexPeriod, IndexDaily])
\`\`\`

## Dependencies

- **@rekog/mcp-nest**: MCP framework for NestJS
- **@modelcontextprotocol/sdk**: MCP SDK
- **ChanModule**: Chan Theory analysis services
- **IndicatorModule**: Technical indicator services
- **TypeORM**: Database access

## License

BSD-3-Clause
```

**Step 2: Verify README is complete**

Run: `wc -l apps/mcp-server/README.md`
Expected: 300+ lines

**Step 3: Commit**

```bash
git add apps/mcp-server/README.md
git commit -m "docs(mcp-server): create comprehensive README with tool reference, configuration, and troubleshooting"
```

---

### Task 4.2: Update .env.example if needed

**Files:**
- Verify: `apps/mcp-server/.env.example`

**Step 1: Check .env.example**

Run: `cat apps/mcp-server/.env.example`
Expected: All required environment variables documented

**Step 2: Update if missing any variables**

Ensure it includes:
- PORT
- mysql_server_host
- mysql_server_port
- mysql_server_username
- mysql_server_password
- mysql_server_database
- NODE_ENV

**Step 3: Commit if updated**

```bash
git add apps/mcp-server/.env.example
git commit -m "docs(mcp-server): ensure .env.example has all required variables"
```

---

## Verification & Completion

### Task V.1: Run complete test suite

**Step 1: Run all tests**

Run: `pnpm run test:mcp-server && pnpm run test:mcp-server:e2e`
Expected: All tests pass

**Step 2: Check coverage**

Run: `pnpm run test:mcp-server:cov 2>&1 | grep -A5 "All files"`
Expected: 80%+ coverage

**Step 3: Verify server starts**

Run: `timeout 5 pnpm run start:dev:mcp-server 2>&1 || true`
Expected: Server initializes without errors

**Step 4: Create verification summary**

Run: `cat > /tmp/mcp-verification.md << 'EOF'
# MCP Server Refactor Verification Checklist

## Phase 1: Critical Errors Fixed
- [x] McpModule import corrected
- [x] Tool decorator with Zod schemas implemented
- [x] ChanModule and IndicatorModule imported
- [x] All service files moved to services/ directory
- [x] Server starts without compilation errors

## Phase 2: Architecture & Code Style
- [x] BaseMcpToolService created
- [x] All services extend BaseMcpToolService
- [x] Directory structure follows project conventions
- [x] Unified error handling and response formats

## Phase 3: Testing
- [x] Unit tests for all 4 services created
- [x] E2E test configuration added
- [x] Test scripts added to package.json
- [x] Coverage ≥ 80%

## Phase 4: Documentation
- [x] Comprehensive README.md created
- [x] All 21 tools documented with examples
- [x] MCP client configuration provided
- [x] Troubleshooting section included

## Final Verification
- [x] All tests pass
- [x] Server starts successfully
- [x] Code style consistent with monorepo
- [x] Documentation complete and accurate
EOF`
Expected: Verification checklist created

**Step 5: Commit verification**

```bash
git add /tmp/mcp-verification.md
git commit -m "docs(mcp-server): add verification checklist - all phases complete"
```

---

## Success Criteria Validation

Before marking this plan as complete, verify:

1. ✅ Server starts without errors
2. ✅ All 21 MCP tools are registered and callable
3. ✅ Unit test coverage ≥ 80%
4. ✅ E2E tests pass
5. ✅ Code style consistent with monorepo standards
6. ✅ Complete README.md following project conventions

Run: `echo "MCP Server Refactor Complete - All success criteria met"`
Expected: Success message displayed

---

## Notes for Future Maintenance

1. **Adding new tools**: Create service extending BaseMcpToolService, add to McpServerModule providers, document in README
2. **Updating Zod schemas**: Modify schemas in service files, update unit tests
3. **Database changes**: Update entities in TypeOrmModule.forFeature(), add migration if needed
4. **Testing**: Always write tests before implementing new features (TDD)

---

## Appendix: MCP Tools Quick Reference

| Category | Tool Name | Service | Parameters |
|----------|-----------|---------|------------|
| Chan Theory | merge_k | ChanMcpService | K-line array |
| Chan Theory | create_bi | ChanMcpService | K-line array |
| Chan Theory | get_fenxing | ChanMcpService | K-line array |
| Chan Theory | create_channel | ChanMcpService | Bi array |
| Chan Theory | analyze_chan_theory | ChanMcpService | K-line array |
| Indicators | calculate_macd | IndicatorMcpService | prices array |
| Indicators | calculate_rsi | IndicatorMcpService | prices array, period |
| Indicators | calculate_kdj | IndicatorMcpService | highs, lows, closes, params |
| Indicators | calculate_adx | IndicatorMcpService | highs, lows, closes, period |
| Indicators | calculate_atr | IndicatorMcpService | highs, lows, closes, period |
| Indicators | analyze_indicators | IndicatorMcpService | highs, lows, closes |
| Data Query | get_index_info | DataMcpService | symbol |
| Data Query | get_kline_data | DataMcpService | symbol, period, limit |
| Data Query | get_daily_kline | DataMcpService | symbol, limit |
| Data Query | list_indices | DataMcpService | none |
| Data Query | get_latest_data | DataMcpService | symbol |
| Schedule | trigger_data_collection | ScheduleMcpService | symbol, period |
| Schedule | list_scheduled_jobs | ScheduleMcpService | none |
| Schedule | get_job_status | ScheduleMcpService | jobName |
| Schedule | trigger_batch_collection | ScheduleMcpService | symbols, periods |
| Schedule | get_schedule_config | ScheduleMcpService | none |

**Total: 21 tools across 4 service categories**

---

**End of Implementation Plan**

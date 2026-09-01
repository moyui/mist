import { createHmac } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import {
  K,
  Period,
  RealtimeSubscriptionAssignment,
  Security,
  SecurityStatus,
} from '@app/shared-data';
import { TimezoneService } from '@app/timezone';
import { subDays } from 'date-fns';

export interface DimensionCheckResult {
  readonly passed: boolean;
  readonly summary: string;
  readonly details?: string[];
  readonly remediation?: string[];
}

export interface PreMarketInspectionReport {
  readonly targetDate: string;
  readonly overallStatus: 'PASSED' | 'FAILED';
  readonly dimensions: {
    readonly datasource: DimensionCheckResult;
    readonly klines: DimensionCheckResult;
    readonly subscription: DimensionCheckResult;
    readonly realtime: DimensionCheckResult;
    readonly infrastructure: DimensionCheckResult;
    readonly pipelineSwitches: DimensionCheckResult;
  };
  readonly markdown: string;
  readonly sentToWechat: boolean;
  readonly sentToFeishu: boolean;
}

const REQUIRED_INTRADAY_PERIODS: Period[] = [
  Period.DAY,
  Period.ONE_MIN,
  Period.FIVE_MIN,
  Period.FIFTEEN_MIN,
  Period.THIRTY_MIN,
  Period.SIXTY_MIN,
];

@Injectable()
export class PreMarketInspectionService {
  private readonly logger = new Logger(PreMarketInspectionService.name);

  constructor(
    @InjectRepository(K)
    private readonly kRepo: Repository<K>,
    @InjectRepository(Security)
    private readonly securityRepo: Repository<Security>,
    @InjectRepository(RealtimeSubscriptionAssignment)
    private readonly assignmentRepo: Repository<RealtimeSubscriptionAssignment>,
    private readonly timezoneService: TimezoneService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Main entrypoint for 09:05 pre-market inspection.
   */
  async runInspection(now?: Date): Promise<PreMarketInspectionReport> {
    const checkTime = now ?? this.timezoneService.getCurrentBeijingTime();
    const dateStr = this.timezoneService.formatDate(checkTime);

    this.logger.log(`[PreMarketInspection] Starting inspection for ${dateStr}`);

    const [
      datasource,
      klines,
      subscription,
      realtime,
      infrastructure,
      pipelineSwitches,
    ] = await Promise.all([
      this.checkDatasourceControlPlane(),
      this.checkHistoricalKLines(checkTime),
      this.checkSubscriptionLifecycle(),
      this.checkRealtimePipeline(),
      this.checkInfrastructure(),
      this.checkPipelineSwitches(),
    ]);

    const overallStatus: 'PASSED' | 'FAILED' =
      datasource.passed &&
      klines.passed &&
      subscription.passed &&
      realtime.passed &&
      infrastructure.passed &&
      pipelineSwitches.passed
        ? 'PASSED'
        : 'FAILED';

    const report: PreMarketInspectionReport = {
      targetDate: dateStr,
      overallStatus,
      dimensions: {
        datasource,
        klines,
        subscription,
        realtime,
        infrastructure,
        pipelineSwitches,
      },
      markdown: this.buildMarkdownReport(dateStr, overallStatus, {
        datasource,
        klines,
        subscription,
        realtime,
        infrastructure,
        pipelineSwitches,
      }),
      sentToWechat: false,
      sentToFeishu: false,
    };

    const [sentWechat, sentFeishu] = await Promise.all([
      this.deliverWechatReport(report.markdown),
      this.deliverFeishuReport(report),
    ]);
    this.logger.log(
      `[PreMarketInspection] delivery result wechat=${sentWechat ? 'sent' : 'skipped/failed'} feishu=${sentFeishu ? 'sent' : 'skipped/failed'} targetDate=${dateStr} status=${overallStatus}`,
    );
    return { ...report, sentToWechat: sentWechat, sentToFeishu: sentFeishu };
  }

  /**
   * 维度 1: 数据源与 Journal 控制面对账检查
   */
  async checkDatasourceControlPlane(): Promise<DimensionCheckResult> {
    const tdxBase =
      this.configService.get<string>('TDX_BASE_URL') ??
      'http://tdx-datasource:9001';
    const qmtBase =
      this.configService.get<string>('QMT_BASE_URL') ??
      'http://qmt-datasource:9002';

    const errors: string[] = [];
    const remediation: string[] = [];

    // Probe QMT health
    try {
      const qmtRes = await fetch(`${qmtBase}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!qmtRes.ok) {
        errors.push(`QMT health probe returned HTTP ${qmtRes.status}`);
      } else {
        const body = (await qmtRes.json()) as Record<string, unknown>;
        const sub = (body['subscriptions'] ?? {}) as Record<string, unknown>;
        if (sub['reconciliationRequired'] === true) {
          errors.push(
            'QMT Journal reconciliation required (control plane locked)',
          );
          remediation.push(
            '1. 首选：重启 QMT 终端 (XtItClient.exe，需人工登录)——bridge 重注册携带新 startedAt 后自动解锁，无需手工文件',
            '2. 备选（终端无法重启）：手工生成 F:\\quant\\MistAPI\\datasource\\state\\context-rebuild-observation.json，字段必须严格为 schemaVersion=1 / observation=qmt_context_rebuilt / affectedJournalSequence=journal 当前 record_sequence / recoveryMode=terminal_process_restarted / operatorEvidenceDigest=64位小写hex / observationTime=RFC3339；格式错误会导致 qmt-datasource 启动 crash loop',
            '3. 验证：GET http://qmt-datasource:9002/health → subscriptions.reconciliationRequired=false',
          );
        }
        if (sub['journalHealthy'] === false) {
          errors.push('QMT Journal is corrupted or unreadable');
        }
        const startupRecon = (sub['startupReconciliation'] ?? {}) as Record<
          string,
          unknown
        >;
        if (startupRecon['phase'] === 'degraded') {
          errors.push(
            `QMT startup reconciliation is degraded (unknownCount=${startupRecon['unknownCount']})`,
          );
        }
      }
    } catch (err) {
      errors.push(
        `QMT datasource unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Probe TDX health
    try {
      const tdxRes = await fetch(`${tdxBase}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!tdxRes.ok) {
        errors.push(`TDX health probe returned HTTP ${tdxRes.status}`);
      }
    } catch (err) {
      errors.push(
        `TDX datasource unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (errors.length > 0) {
      return {
        passed: false,
        summary: `数据源与 Journal 异常 (${errors.length} 项告警)`,
        details: errors,
        remediation: remediation.length > 0 ? remediation : undefined,
      };
    }

    return {
      passed: true,
      summary: 'TDX & QMT 数据源就绪，Journal 对账健康',
    };
  }

  /**
   * 维度 2: 前一交易日收盘历史 K 线完整性检查
   */
  async checkHistoricalKLines(now: Date): Promise<DimensionCheckResult> {
    const previousTradingDay = await this.resolvePreviousTradingDay(now);
    if (!previousTradingDay) {
      return {
        passed: true,
        summary: '未获取到前一交易日（首日或日历初始化），跳过 K 线校验',
      };
    }

    const prevDateStr = this.timezoneService.formatDate(previousTradingDay);
    const startOfDay = new Date(`${prevDateStr}T00:00:00+08:00`);
    const endOfDay = new Date(`${prevDateStr}T23:59:59+08:00`);

    // Query active assigned securities
    const activeAssignments = await this.assignmentRepo.find({
      relations: ['security', 'sourceConfig'],
      where: {
        security: { status: SecurityStatus.ACTIVE },
      },
    });

    const securityIds = [
      ...new Set(activeAssignments.map((a) => a.securityId)),
    ];
    if (securityIds.length === 0) {
      return {
        passed: true,
        summary: '当前无 ACTIVE 订阅标的，K 线基线无需校验',
      };
    }

    // Check presence of required periods for each security on previousTradingDay
    const missingItems: string[] = [];
    const missingTargets = new Set<string>();
    for (const secId of securityIds) {
      const code =
        activeAssignments.find((a) => a.securityId === secId)?.security?.code ??
        `ID=${secId}`;
      for (const period of REQUIRED_INTRADAY_PERIODS) {
        const count = await this.kRepo.count({
          where: {
            security: { id: secId },
            period,
            timestamp: Between(startOfDay, endOfDay),
          },
        });
        if (count === 0) {
          missingItems.push(
            `标的 ${code} 缺失 ${prevDateStr} 周期 ${period} 数据`,
          );
          missingTargets.add(String(code));
        }
      }
    }

    if (missingItems.length > 0) {
      return {
        passed: false,
        summary: `前一交易日 (${prevDateStr}) 存在 ${missingItems.length} 条 K 线缺失`,
        details: missingItems.slice(0, 10), // Limit summary to first 10
        remediation: [
          `缺失标的: ${[...missingTargets].join(', ')}`,
          `手动补录：POST 后端 8001 /v1/collector/collect，body {"code":"<code>","period":<1|5|15|30|60>,"startDate":"${prevDateStr}","endDate":"${prevDateStr}"}（与收盘同步同走 collectKForSource；TDX 源 1m 历史可能无数据，返回 count=0 即 provider 无该数据）`,
        ],
      };
    }

    return {
      passed: true,
      summary: `前一交易日 (${prevDateStr}) 标的池各周期 K 线完整 (${securityIds.length} 标的)`,
    };
  }

  /**
   * 维度 3: 活跃订阅标的分配与统计
   */
  async checkSubscriptionLifecycle(): Promise<DimensionCheckResult> {
    const assignments = await this.assignmentRepo.find({
      relations: ['security', 'sourceConfig'],
      where: {
        security: { status: SecurityStatus.ACTIVE },
      },
    });

    const bySource: Record<string, number> = {};
    for (const a of assignments) {
      const src = a.sourceConfig?.source ?? 'unknown';
      bySource[src] = (bySource[src] ?? 0) + 1;
    }

    const summaryList = Object.entries(bySource)
      .map(([s, c]) => `${s}: ${c} 标的`)
      .join(', ');

    return {
      passed: true,
      summary: summaryList
        ? `活跃订阅池 (${summaryList})`
        : '当前无 ACTIVE 订阅标的',
    };
  }

  /**
   * 维度 4: 实时数据流与 Bridge 链路通畅度检查
   */
  async checkRealtimePipeline(): Promise<DimensionCheckResult> {
    const tdxBase =
      this.configService.get<string>('TDX_BASE_URL') ??
      'http://tdx-datasource:9001';
    const qmtBase =
      this.configService.get<string>('QMT_BASE_URL') ??
      'http://qmt-datasource:9002';

    const errors: string[] = [];

    // Probe bridge and websocket readiness from datasources
    try {
      const tdxRes = await fetch(`${tdxBase}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (tdxRes.ok) {
        const body = (await tdxRes.json()) as Record<string, unknown>;
        const bridge = (body['bridge'] ?? {}) as Record<string, unknown>;
        if (bridge['ready'] === false) {
          errors.push('TDX Bridge TCP 未就绪 (bridge_ready=0)');
        }
      }
    } catch (e) {
      errors.push(`TDX 实时链路状态探测失败: ${e}`);
    }

    try {
      const qmtRes = await fetch(`${qmtBase}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (qmtRes.ok) {
        const body = (await qmtRes.json()) as Record<string, unknown>;
        const bridge = (body['bridge'] ?? {}) as Record<string, unknown>;
        if (bridge['ready'] === false) {
          errors.push('QMT Bridge TCP 未就绪 (bridge_ready=0)');
        }
      }
    } catch (e) {
      errors.push(`QMT 实时链路状态探测失败: ${e}`);
    }

    if (errors.length > 0) {
      return {
        passed: false,
        summary: '实时行情 Bridge / WS 链路异常',
        details: errors,
        remediation: [
          '检查 Windows 宿主 TDX / QMT 终端登录状态及 9003/9004 TCP 端口连接',
        ],
      };
    }

    return {
      passed: true,
      summary: 'TDX / QMT Bridge TCP 与 WebSocket 就绪',
    };
  }

  /**
   * 维度 5: 基础设施存活性探测
   */
  async checkInfrastructure(): Promise<DimensionCheckResult> {
    const errors: string[] = [];

    // MySQL probe
    try {
      await this.securityRepo.query('SELECT 1');
    } catch (err) {
      errors.push(
        `MySQL 连接探测失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Signal service probe
    const signalHealthUrl =
      this.configService.get<string>('SIGNAL_HEALTH_URL') ??
      'http://signal:8010/health';
    try {
      const res = await fetch(signalHealthUrl, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        errors.push(`Signal 服务健康端点返回 HTTP ${res.status}`);
      } else {
        const body = (await res.json()) as Record<string, unknown>;
        if (body['status'] !== 'ok') {
          errors.push(`Signal 服务状态异常: status=${body['status']}`);
        }
      }
    } catch (err) {
      errors.push(
        `Signal 服务无法访问: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (errors.length > 0) {
      return {
        passed: false,
        summary: '底层基础设施或服务异常',
        details: errors,
        remediation: [
          '使用 `docker ps` 排查异常容器 (mysql, signal) 并查看日志',
        ],
      };
    }

    return {
      passed: true,
      summary: 'MySQL 与 Signal 运行正常',
    };
  }

  /**
   * 维度 6: 运行时开关与防断链闸门检查
   */
  async checkPipelineSwitches(): Promise<DimensionCheckResult> {
    const backendHealthUrl =
      this.configService.get<string>('BACKEND_HEALTH_URL') ??
      'http://mist-backend:8001/health';
    const signalHealthUrl =
      this.configService.get<string>('SIGNAL_HEALTH_URL') ??
      'http://signal:8010/health';
    const tdxBase =
      this.configService.get<string>('TDX_BASE_URL') ??
      'http://tdx-datasource:9001';
    const qmtBase =
      this.configService.get<string>('QMT_BASE_URL') ??
      'http://qmt-datasource:9002';
    const wechatWebhook =
      this.configService.get<string>('OO_ALERT_WECHAT_WEBHOOK') ||
      this.configService.get<string>('NOTIFICATION_WECHAT_WEBHOOK');

    const errors: string[] = [];
    const remediation: string[] = [];
    const statusBadges: Record<string, string> = {
      backend: 'unknown',
      signal: 'unknown',
      tdx: 'unknown',
      qmt: 'unknown',
      redis: 'unknown',
      lifecycle: 'unknown',
      wechat: wechatWebhook ? 'ok' : 'missing',
    };

    if (!wechatWebhook) {
      errors.push('微信告警 Webhook 未配置 (NOTIFICATION_WECHAT_WEBHOOK 缺失)');
      remediation.push(
        '在 .env 中配置有效企业微信 Webhook: NOTIFICATION_WECHAT_WEBHOOK',
      );
    }

    // 1. Probe Backend health & runtime switches
    try {
      const res = await fetch(backendHealthUrl, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        errors.push(`Backend 健康端点返回 HTTP ${res.status}`);
        statusBadges.backend = 'error';
      } else {
        const body = (await res.json()) as Record<string, unknown>;
        const data = (body['data'] ?? body) as Record<string, unknown>;
        const prodMode = data['productizationMode'];
        const stratMode = data['strategyMode'];
        const redisOk = data['redisAvailable'] === true;
        const autoReconcileOk = data['autoReconcile'] === true;

        statusBadges.backend = String(prodMode ?? 'unknown');
        statusBadges.redis = redisOk ? 'ok' : 'unavailable';
        statusBadges.lifecycle = autoReconcileOk ? 'ok' : 'disabled';

        if (prodMode !== 'on') {
          errors.push(`Backend Candle 产品化开关处于 ${prodMode} (必须为 on)`);
          remediation.push(
            '在 Windows 宿主机执行: Set-DockerEnvValue -Path F:\\MistDocker\\.env -Key REALTIME_PRODUCTIZATION_MODE -Value on; docker compose up -d --force-recreate mist-backend',
          );
        }
        if (stratMode !== 'on') {
          errors.push(`Backend 策略派发开关处于 ${stratMode} (必须为 on)`);
          remediation.push(
            '在 Windows 宿主机执行: Set-DockerEnvValue -Path F:\\MistDocker\\.env -Key REALTIME_STRATEGY_MODE -Value on; docker compose up -d --force-recreate mist-backend',
          );
        }
        if (!redisOk) {
          errors.push('Backend Realtime Redis 处于不可用状态');
          remediation.push(
            '检查 mist-realtime-redis 容器状态及 MIST_REALTIME_REDIS_URL 配置',
          );
        }
        if (!autoReconcileOk) {
          errors.push(
            'Backend 订阅生命周期自动对账处于禁用状态 (autoReconcile=false)',
          );
          remediation.push(
            "在 MySQL 中执行: INSERT INTO runtime_configs (config_key, config_value) VALUES ('realtime_subscription_auto_reconcile', 'true') ON DUPLICATE KEY UPDATE config_value='true';",
          );
        }
      }
    } catch (err) {
      errors.push(
        `Backend 健康端点无法访问: ${err instanceof Error ? err.message : String(err)}`,
      );
      statusBadges.backend = 'unreachable';
    }

    // 2. Probe Signal health & runtime switches
    try {
      const res = await fetch(signalHealthUrl, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        errors.push(`Signal 服务健康端点返回 HTTP ${res.status}`);
        statusBadges.signal = 'error';
      } else {
        const body = (await res.json()) as Record<string, unknown>;
        const data = (body['data'] ?? body) as Record<string, unknown>;
        const realtimeMode = data['realtimeMode'];
        statusBadges.signal = String(realtimeMode ?? 'unknown');

        if (realtimeMode !== 'on') {
          errors.push(`Signal 实时策略模式处于 ${realtimeMode} (必须为 on)`);
          remediation.push(
            '在 Windows 宿主机执行: Set-DockerEnvValue -Path F:\\MistDocker\\.env -Key REALTIME_STRATEGY_MODE -Value on; docker compose up -d --force-recreate mist-signal',
          );
        }
      }
    } catch (err) {
      errors.push(
        `Signal 服务无法访问: ${err instanceof Error ? err.message : String(err)}`,
      );
      statusBadges.signal = 'unreachable';
    }

    // 3. Probe TDX datasource realtime mode
    try {
      const res = await fetch(`${tdxBase}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const body = (await res.json()) as Record<string, unknown>;
        const mode = body['realtimeMode'];
        statusBadges.tdx = String(mode ?? 'unknown');
        if (mode !== 'builtin') {
          errors.push(`TDX 数据源实时模式处于 ${mode} (必须为 builtin)`);
        }
      }
    } catch {
      statusBadges.tdx = 'unreachable';
    }

    // 4. Probe QMT datasource realtime mode
    try {
      const res = await fetch(`${qmtBase}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const body = (await res.json()) as Record<string, unknown>;
        const mode = body['realtimeMode'];
        statusBadges.qmt = String(mode ?? 'unknown');
        if (mode !== 'builtin') {
          errors.push(`QMT 数据源实时模式处于 ${mode} (必须为 builtin)`);
        }
      }
    } catch {
      statusBadges.qmt = 'unreachable';
    }

    const badgeStr = `backend=${statusBadges.backend} | signal=${statusBadges.signal} | tdx=${statusBadges.tdx} | qmt=${statusBadges.qmt} | redis=${statusBadges.redis} | lifecycle=${statusBadges.lifecycle} | wechat=${statusBadges.wechat}`;

    if (errors.length > 0) {
      return {
        passed: false,
        summary: `关键链路开关异常 (${badgeStr})`,
        details: errors,
        remediation: [...new Set(remediation)],
      };
    }

    return {
      passed: true,
      summary: badgeStr,
    };
  }

  /**
   * 生成深度结构化 Markdown 简报
   */
  buildMarkdownReport(
    dateStr: string,
    overallStatus: 'PASSED' | 'FAILED',
    dimensions: PreMarketInspectionReport['dimensions'],
  ): string {
    const isPassed = overallStatus === 'PASSED';
    const headerEmoji = isPassed ? '🟢' : '🔴';
    const headerTitle = isPassed
      ? '09:05 盘前系统体检通过 (All Green)'
      : '09:05 盘前体检发现异常 (需立即介入)';

    const lines: string[] = [
      `### ${headerEmoji} ${headerTitle}`,
      `- **交易日期**：${dateStr}`,
      `- **链路开关**：${dimensions.pipelineSwitches.passed ? '🟢 正常' : '🔴 异常'}（${dimensions.pipelineSwitches.summary}）`,
      `- **数据源/Journal**：${dimensions.datasource.passed ? '🟢 正常' : '🔴 异常'}（${dimensions.datasource.summary}）`,
      `- **昨夜收盘K线**：${dimensions.klines.passed ? '🟢 完整' : '🔴 缺失'}（${dimensions.klines.summary}）`,
      `- **活跃订阅分配**：${dimensions.subscription.passed ? '🟢 正常' : '🔴 异常'}（${dimensions.subscription.summary}）`,
      `- **实时通信链路**：${dimensions.realtime.passed ? '🟢 通畅' : '🔴 异常'}（${dimensions.realtime.summary}）`,
      `- **基础服务状态**：${dimensions.infrastructure.passed ? '🟢 正常' : '🔴 故障'}（${dimensions.infrastructure.summary}）`,
    ];

    if (!isPassed) {
      lines.push('', '---', '#### ⚠️ 故障详情与排查指引：');
      for (const [dimKey, result] of Object.entries(dimensions)) {
        if (!result.passed) {
          lines.push(`**【${dimKey}】** ${result.summary}`);
          if (result.details && result.details.length > 0) {
            for (const d of result.details) {
              lines.push(`  - ❌ ${d}`);
            }
          }
          if (result.remediation && result.remediation.length > 0) {
            lines.push('  - ⚡ **恢复指引**：');
            for (const r of result.remediation) {
              lines.push(`    ${r}`);
            }
          }
        }
      }
    } else {
      lines.push(
        '',
        '> 距离 09:15 订阅重置还有 10 分钟，距离 09:30 开盘还有 25 分钟，全系统就绪。',
      );
    }

    return lines.join('\n');
  }

  /**
   * 推送企业微信机器人 Webhook
   */
  async deliverWechatReport(markdown: string): Promise<boolean> {
    const webhook =
      this.configService.get<string>('OO_ALERT_WECHAT_WEBHOOK') ||
      this.configService.get<string>('NOTIFICATION_WECHAT_WEBHOOK');

    if (!webhook) {
      this.logger.warn(
        '[PreMarketInspection] No WeCom webhook configured (OO_ALERT_WECHAT_WEBHOOK / NOTIFICATION_WECHAT_WEBHOOK missing), skipping dispatch',
      );
      return false;
    }

    return this.postWecomMarkdown(webhook, markdown);
  }

  /**
   * 推送飞书群机器人 Webhook（可选加签，富文本 post）
   */
  async deliverFeishuReport(
    report: PreMarketInspectionReport,
  ): Promise<boolean> {
    const webhook =
      this.configService.get<string>('OO_ALERT_FEISHU_WEBHOOK') ||
      this.configService.get<string>('NOTIFICATION_FEISHU_WEBHOOK');
    if (!webhook) {
      return false;
    }
    const secret =
      this.configService.get<string>('OO_ALERT_FEISHU_SECRET') ||
      this.configService.get<string>('NOTIFICATION_FEISHU_SECRET') ||
      '';
    return this.postFeishuPost(webhook, secret, this.buildFeishuPost(report));
  }

  /**
   * 从结构化报告构建飞书富文本（post）——飞书 text 不渲染 markdown，
   * post 的每个段落（[]）是一行，text 标签不支持加粗，用 emoji+状态词呈现。
   */
  private buildFeishuPost(report: PreMarketInspectionReport): {
    title: string;
    content: ReadonlyArray<readonly { tag: 'text'; text: string }[]>;
  } {
    const isPassed = report.overallStatus === 'PASSED';
    const title = isPassed
      ? '🟢 09:05 盘前系统体检通过 (All Green)'
      : '🔴 09:05 盘前体检发现异常 (需立即介入)';
    const d = report.dimensions;
    const badge = (ok: boolean): string => (ok ? '🟢' : '🔴');
    const rows: string[] = [
      `${badge(d.pipelineSwitches.passed)}链路开关：${d.pipelineSwitches.passed ? '正常' : '异常'}（${d.pipelineSwitches.summary}）`,
      `${badge(d.datasource.passed)}数据源/Journal：${d.datasource.passed ? '正常' : '异常'}（${d.datasource.summary}）`,
      `${badge(d.klines.passed)}昨夜收盘K线：${d.klines.passed ? '完整' : '缺失'}（${d.klines.summary}）`,
      `${badge(d.subscription.passed)}活跃订阅分配：${d.subscription.passed ? '正常' : '异常'}（${d.subscription.summary}）`,
      `${badge(d.realtime.passed)}实时通信链路：${d.realtime.passed ? '通畅' : '异常'}（${d.realtime.summary}）`,
      `${badge(d.infrastructure.passed)}基础服务状态：${d.infrastructure.passed ? '正常' : '故障'}（${d.infrastructure.summary}）`,
    ];
    if (isPassed) {
      rows.push(
        '全系统就绪，距离 09:15 订阅重置还有 10 分钟，距离 09:30 开盘还有 25 分钟。',
      );
    } else {
      rows.push('————', '⚠️ 故障详情与排查指引：');
      for (const [dimKey, result] of Object.entries(d)) {
        if (!result.passed) {
          rows.push(`【${dimKey}】${result.summary}`);
          for (const detail of result.details ?? []) {
            rows.push(`❌ ${detail}`);
          }
          for (const remediation of result.remediation ?? []) {
            rows.push(`⚡ ${remediation}`);
          }
        }
      }
    }
    return {
      title,
      // 每行段落之间插入空文本段落，飞书 post 渲染为空行，方便区分各标题行。
      content: rows.flatMap((text, index) => {
        const paragraph = [{ tag: 'text', text }] as const;
        return index === rows.length - 1
          ? [paragraph]
          : [paragraph, [{ tag: 'text', text: '' }] as const];
      }),
    };
  }

  private async postWecomMarkdown(
    webhook: string,
    markdown: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'markdown',
          markdown: {
            content: markdown,
          },
        }),
      });
      if (!res.ok) {
        this.logger.error(
          `[PreMarketInspection] WeCom webhook returned HTTP ${res.status}`,
        );
        return false;
      }
      this.logger.log(
        '[PreMarketInspection] Successfully delivered report to WeChat',
      );
      return true;
    } catch (err) {
      this.logger.error(
        `[PreMarketInspection] Failed to send report to WeChat: ${err}`,
      );
      return false;
    }
  }

  private async postFeishuPost(
    webhook: string,
    secret: string,
    post: {
      title: string;
      content: ReadonlyArray<readonly { tag: 'text'; text: string }[]>;
    },
  ): Promise<boolean> {
    try {
      const payload: Record<string, unknown> = {
        msg_type: 'post',
        content: { post: { zh_cn: post } },
      };
      const trimmed = secret.trim();
      if (trimmed) {
        // Keep signing clock injectable in tests via Date.now mock; production uses wall clock.
        // Feishu official signing: HMAC key = `${timestamp}\n${secret}`, EMPTY message.
        const timestamp = String(Math.floor(Date.now() / 1000));
        const stringToSign = `${timestamp}\n${trimmed}`;
        const sign = createHmac('sha256', stringToSign).digest('base64');
        payload.timestamp = timestamp;
        payload.sign = sign;
      }
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        this.logger.error(
          `[PreMarketInspection] Feishu webhook returned HTTP ${res.status}`,
        );
        return false;
      }
      const json = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      const code =
        typeof json.StatusCode === 'number'
          ? json.StatusCode
          : typeof json.code === 'number'
            ? json.code
            : undefined;
      if (code !== undefined && code !== 0) {
        this.logger.error(
          `[PreMarketInspection] Feishu webhook returned code=${code} msg=${String(json.msg ?? json.StatusMessage ?? '')}`,
        );
        return false;
      }
      this.logger.log(
        '[PreMarketInspection] Successfully delivered report to Feishu',
      );
      return true;
    } catch (err) {
      this.logger.error(
        `[PreMarketInspection] Failed to send report to Feishu: ${err}`,
      );
      return false;
    }
  }

  private async resolvePreviousTradingDay(
    currentDate: Date,
  ): Promise<Date | null> {
    for (let i = 1; i <= 10; i++) {
      const candidate = subDays(currentDate, i);
      if (await this.timezoneService.isTradingDay(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}

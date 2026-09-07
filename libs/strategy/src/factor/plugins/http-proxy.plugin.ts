import type {
  FactorCategory,
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor.types';

export interface HttpProxyPluginConfig {
  readonly id: string;
  readonly name: string;
  readonly category?: FactorCategory;
  readonly version?: string;
  readonly description?: string;
  readonly endpointUrl: string;
  readonly timeoutMs?: number;
}

/**
 * 通用外置 HTTP 因子代理插件
 * 允许无缝桥接 Python / FastAPI / AI 模型 / 外部另类数据接口
 * 具备硬超时 (默认200ms) 与异常自动弃权熔断机制，确保不阻塞交易主干道
 */
export class HttpProxyFactorPlugin implements FactorPlugin {
  public readonly id: string;
  public readonly name: string;
  public readonly category: FactorCategory;
  public readonly version: string;
  public readonly description: string;
  public readonly endpointUrl: string;
  public readonly timeoutMs: number;

  constructor(config: HttpProxyPluginConfig) {
    this.id = config.id;
    this.name = config.name;
    this.category = config.category ?? 'AI_SENTIMENT';
    this.version = config.version ?? '1.0.0';
    this.description =
      config.description ??
      `通过 HTTP POST 代理访问外部模型服务的因子插件 (${config.endpointUrl})`;
    this.endpointUrl = config.endpointUrl;
    this.timeoutMs = config.timeoutMs ?? 200;
  }

  public async evaluate(
    context: FactorContext,
    params?: Record<string, unknown>,
  ): Promise<FactorOpinion> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    // 将黑板 Map 转换为序列化对象
    const attrObj: Record<string, unknown> = {};
    context.attributes.forEach((val, key) => {
      attrObj[key] = val;
    });

    const requestPayload = {
      pluginId: this.id,
      securityId: context.securityId,
      securityCode: context.securityCode,
      timestamp: context.timestamp.toISOString(),
      period: context.period,
      attributes: attrObj,
      params: params ?? {},
    };

    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          action: 'NEUTRAL',
          confidence: 0.0,
          reason: `外置HTTP因子服务响应异常 (HTTP ${response.status})，自动弃权`,
        };
      }

      const data = (await response.json()) as any;

      if (!data || typeof data.action !== 'string') {
        return {
          action: 'NEUTRAL',
          confidence: 0.0,
          reason: '外置HTTP因子服务返回格式不合法，自动弃权',
        };
      }

      const action =
        data.action === 'BUY' || data.action === 'SELL'
          ? data.action
          : 'NEUTRAL';
      const confidence =
        typeof data.confidence === 'number' && Number.isFinite(data.confidence)
          ? Math.max(0.0, Math.min(1.0, data.confidence))
          : 0.0;
      const reason =
        typeof data.reason === 'string'
          ? data.reason
          : '外置HTTP因子服务返回成功';

      return {
        action,
        confidence,
        reason,
        evidence: data.evidence,
      };
    } catch (err: any) {
      const isTimeout = err?.name === 'AbortError';
      return {
        action: 'NEUTRAL',
        confidence: 0.0,
        reason: isTimeout
          ? `外置HTTP因子评估超时(${this.timeoutMs}ms)，自动弃权熔断`
          : `外置HTTP因子调用发生网络或解析错误: ${err?.message ?? String(err)}，自动弃权`,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

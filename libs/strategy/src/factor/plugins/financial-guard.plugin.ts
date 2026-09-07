import type {
  FactorContext,
  FactorOpinion,
  FactorPlugin,
} from '../factor.types';

export interface FinancialSafetyGuardParams {
  readonly minRoe?: number;
  readonly maxDebtRatio?: number;
  readonly roeAttributeKey?: string;
  readonly debtRatioAttributeKey?: string;
}

/**
 * 基本面类示范插件：财务安全防线门禁
 * 检查标的 ROE 是否达标且资产负债率是否在安全边界内，不达标则行使一票否决
 */
export class FinancialSafetyGuardPlugin implements FactorPlugin {
  public readonly id = 'plugin.fundamental.safety-guard';
  public readonly name = '基本面财务安全门禁插件';
  public readonly category = 'FUNDAMENTAL' as const;
  public readonly version = '1.0.0';
  public readonly description =
    '评估标的连续盈利能力(ROE)与债务杠杆边界，为决策流提供基本面避雷前置门禁';

  public readonly paramSchema = {
    minRoe: {
      type: 'number',
      default: 8.0,
      description: '最低净资产收益率百分比',
    },
    maxDebtRatio: {
      type: 'number',
      default: 70.0,
      description: '最高资产负债率百分比',
    },
  };

  public async evaluate(
    context: FactorContext,
    rawParams?: Record<string, unknown>,
  ): Promise<FactorOpinion> {
    const minRoe =
      typeof rawParams?.minRoe === 'number' ? rawParams.minRoe : 8.0;
    const maxDebtRatio =
      typeof rawParams?.maxDebtRatio === 'number'
        ? rawParams.maxDebtRatio
        : 70.0;

    // 从共享黑板或外部 featureProvider 中获取财务特征，若无则从 params 模拟注入
    let roe: number | undefined;
    let debtRatio: number | undefined;

    const roeKey = (rawParams?.roeAttributeKey as string) ?? 'fundamental.roe';
    const debtKey =
      (rawParams?.debtRatioAttributeKey as string) ?? 'fundamental.debtRatio';

    if (context.attributes.has(roeKey)) {
      roe = Number(context.attributes.get(roeKey));
    }
    if (context.attributes.has(debtKey)) {
      debtRatio = Number(context.attributes.get(debtKey));
    }

    if (roe === undefined && context.featureProvider) {
      const featRoe = await context.featureProvider.getFeature(
        'roe',
        context.securityCode,
      );
      if (typeof featRoe === 'number') roe = featRoe;
    }
    if (debtRatio === undefined && context.featureProvider) {
      const featDebt = await context.featureProvider.getFeature(
        'debtRatio',
        context.securityCode,
      );
      if (typeof featDebt === 'number') debtRatio = featDebt;
    }

    // 若测试或调用方直接在 params 传入模拟指标
    if (roe === undefined && typeof rawParams?.mockRoe === 'number') {
      roe = rawParams.mockRoe;
    }
    if (
      debtRatio === undefined &&
      typeof rawParams?.mockDebtRatio === 'number'
    ) {
      debtRatio = rawParams.mockDebtRatio;
    }

    // 若数据完全缺失，默认中立弃权或保守通过
    if (roe === undefined && debtRatio === undefined) {
      return {
        action: 'BUY',
        confidence: 0.5,
        reason: '未配置财务数据源，基本面门禁默认中立放行',
        evidence: { bypassed: true },
      };
    }

    const isRoeSafe = roe === undefined || roe >= minRoe;
    const isDebtSafe = debtRatio === undefined || debtRatio <= maxDebtRatio;

    if (isRoeSafe && isDebtSafe) {
      return {
        action: 'BUY',
        confidence: 0.9,
        reason: `财务基本面达标 (ROE: ${roe ?? 'N/A'}% >= ${minRoe}%, 资产负债率: ${debtRatio ?? 'N/A'}% <= ${maxDebtRatio}%)`,
        evidence: {
          roe,
          minRoe,
          debtRatio,
          maxDebtRatio,
          passed: true,
        },
      };
    }

    return {
      action: 'SELL',
      confidence: 0.95,
      reason: `基本面存在财务隐患: ${!isRoeSafe ? `ROE(${roe}%)低于${minRoe}% ` : ''}${!isDebtSafe ? `资产负债率(${debtRatio}%)超过${maxDebtRatio}%` : ''}`,
      evidence: {
        roe,
        minRoe,
        debtRatio,
        maxDebtRatio,
        passed: false,
      },
    };
  }
}

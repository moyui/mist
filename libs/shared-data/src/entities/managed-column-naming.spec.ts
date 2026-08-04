import { getMetadataArgsStorage } from 'typeorm';
import { KExtensionEf } from './k-extension-ef.entity';
import { KExtensionQmt } from './k-extension-qmt.entity';
import { KExtensionTdx } from './k-extension-tdx.entity';
import { K } from './k.entity';
import { SecuritySourceConfig } from './security-source-config.entity';
import { RealtimeSubscriptionAssignment } from './realtime-subscription-assignment.entity';

describe('managed physical column naming metadata', () => {
  const storage = getMetadataArgsStorage();

  it.each([
    [SecuritySourceConfig, 'formatCode', 'format_code'],
    [RealtimeSubscriptionAssignment, 'securityId', 'security_id'],
    [RealtimeSubscriptionAssignment, 'sourceConfigId', 'source_config_id'],
    [K, 'securityId', 'security_id'],
    [KExtensionEf, 'changePct', 'change_pct'],
    [KExtensionEf, 'changeAmt', 'change_amt'],
    [KExtensionEf, 'turnoverRate', 'turnover_rate'],
    [KExtensionEf, 'volumeCount', 'volume_count'],
    [KExtensionEf, 'innerVolume', 'inner_volume'],
    [KExtensionEf, 'outerVolume', 'outer_volume'],
    [KExtensionEf, 'prevClose', 'prev_close'],
    [KExtensionEf, 'prevOpen', 'prev_open'],
    [KExtensionTdx, 'forwardFactor', 'forward_factor'],
    [KExtensionTdx, 'volInStock', 'vol_in_stock'],
    [KExtensionTdx, 'backwardFactor', 'backward_factor'],
    [KExtensionTdx, 'volumeRatio', 'volume_ratio'],
    [KExtensionTdx, 'turnoverRate', 'turnover_rate'],
    [KExtensionTdx, 'turnoverAmount', 'turnover_amount'],
    [KExtensionTdx, 'totalMarketValue', 'total_market_value'],
    [KExtensionTdx, 'floatMarketValue', 'float_market_value'],
    [KExtensionTdx, 'earningsPerShare', 'earnings_per_share'],
    [KExtensionTdx, 'priceEarningsRatio', 'price_earnings_ratio'],
    [KExtensionTdx, 'priceToBookRatio', 'price_to_book_ratio'],
    [KExtensionQmt, 'preClose', 'pre_close'],
    [KExtensionQmt, 'suspendFlag', 'suspend_flag'],
    [KExtensionQmt, 'openInterest', 'open_interest'],
  ])('%s.%s maps to %s', (target, propertyName, physicalColumnName) => {
    const column = storage.columns.find(
      (candidate) =>
        candidate.target === target && candidate.propertyName === propertyName,
    );

    expect(column).toBeDefined();
    expect(column?.options.name).toBe(physicalColumnName);
  });
});

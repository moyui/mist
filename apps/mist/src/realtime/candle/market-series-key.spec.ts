import { marketSeriesKey } from './market-series-key';

describe('marketSeriesKey', () => {
  it('retains both canonical security identity and source dimension', () => {
    expect(marketSeriesKey(7, 'tdx')).toBe('7:tdx');
    expect(marketSeriesKey(7, 'qmt')).toBe('7:qmt');
  });
});

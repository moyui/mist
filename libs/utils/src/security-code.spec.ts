import { DataSource } from '@app/shared-data';
import {
  getSecurityFormatCode,
  isValidSecuritySourceFormatCode,
  normalizeSecurityCode,
} from './security-code';

describe('normalizeSecurityCode', () => {
  it('keeps pure stock codes as canonical internal codes', () => {
    expect(normalizeSecurityCode('600519')).toBe('600519');
  });

  it.each([
    ['600519.SH', '600519'],
    ['002475.sz', '002475'],
    ['  430047.BJ  ', '430047'],
  ])('removes provider market suffix from %s', (input, expected) => {
    expect(normalizeSecurityCode(input)).toBe(expected);
  });

  it.each([
    ['SH600519', '600519'],
    ['sz002475', '002475'],
    [' bj430047 ', '430047'],
  ])('removes provider market prefix from %s', (input, expected) => {
    expect(normalizeSecurityCode(input)).toBe(expected);
  });

  it('trims and uppercases unsupported symbols without stripping identity', () => {
    expect(normalizeSecurityCode(' custom-code ')).toBe('CUSTOM-CODE');
  });
});

describe('provider format code boundary', () => {
  it.each([
    [DataSource.TDX, '600519.SH'],
    [DataSource.TDX, '430047.BJ'],
    [DataSource.QMT, '002475.SZ'],
    [DataSource.EAST_MONEY, 'sh000001'],
  ])('accepts valid %s provider symbol %s', (source, formatCode) => {
    expect(isValidSecuritySourceFormatCode(source, formatCode)).toBe(true);
  });

  it.each([
    [DataSource.TDX, '600519'],
    [DataSource.TDX, '600519.sh'],
    [DataSource.QMT, 'SH600519'],
    [DataSource.QMT, ''],
    [DataSource.EAST_MONEY, '   '],
  ])('rejects invalid %s provider symbol %s', (source, formatCode) => {
    expect(isValidSecuritySourceFormatCode(source, formatCode)).toBe(false);
  });

  it('returns the trimmed provider symbol from the enabled source config', () => {
    expect(
      getSecurityFormatCode(
        {
          code: '600519',
          sourceConfigs: [
            {
              source: DataSource.TDX,
              enabled: true,
              formatCode: ' 600519.SH ',
            },
          ],
        },
        DataSource.TDX,
      ),
    ).toBe('600519.SH');
  });

  it('does not fall back to canonical Security.code', () => {
    expect(() =>
      getSecurityFormatCode(
        { code: '600519', sourceConfigs: [] },
        DataSource.TDX,
      ),
    ).toThrow('provider symbol resolution failed');
  });

  it('fails closed on malformed enabled TDX/QMT configuration', () => {
    expect(() =>
      getSecurityFormatCode(
        {
          code: '600519',
          sourceConfigs: [
            {
              source: DataSource.QMT,
              enabled: true,
              formatCode: '600519',
            },
          ],
        },
        DataSource.QMT,
      ),
    ).toThrow('Invalid enabled qmt formatCode');
  });
});

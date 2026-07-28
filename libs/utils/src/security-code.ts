import { DataSource, SecuritySourceConfig } from '@app/shared-data';

const MARKET_CODES = ['SH', 'SZ', 'BJ'] as const;
const MARKET_PATTERN = MARKET_CODES.join('|');

type SecurityFormatCodeSource = {
  code: string;
  sourceConfigs?: Array<
    Pick<SecuritySourceConfig, 'source' | 'enabled' | 'formatCode'>
  > | null;
};

const MARKET_QUALIFIED_PROVIDER_SYMBOL = /^\d{6}\.(SH|SZ|BJ)$/;

export function normalizeSecurityCode(code: string): string {
  const normalized = code.trim().toUpperCase();

  const suffixed = normalized.match(
    new RegExp(`^(\\d{6})\\.(${MARKET_PATTERN})$`),
  );
  if (suffixed) {
    return suffixed[1];
  }

  const prefixed = normalized.match(
    new RegExp(`^(${MARKET_PATTERN})(\\d{6})$`),
  );
  if (prefixed) {
    return prefixed[2];
  }

  return normalized;
}

export function isValidSecuritySourceFormatCode(
  source: DataSource,
  formatCode: string,
): boolean {
  const providerSymbol = formatCode.trim();
  if (!providerSymbol) {
    return false;
  }
  if (source === DataSource.TDX || source === DataSource.QMT) {
    return MARKET_QUALIFIED_PROVIDER_SYMBOL.test(providerSymbol);
  }
  return true;
}

export function getSecurityFormatCode(
  security: SecurityFormatCodeSource,
  dataSource: DataSource,
): string {
  const config = security.sourceConfigs?.find(
    (sourceConfig) =>
      sourceConfig.source === dataSource && sourceConfig.enabled,
  );
  if (!config) {
    throw new Error(
      `No enabled source config for ${dataSource}; provider symbol resolution failed`,
    );
  }

  const formatCode = config.formatCode.trim();
  if (!isValidSecuritySourceFormatCode(dataSource, formatCode)) {
    throw new Error(
      `Invalid enabled ${dataSource} formatCode '${formatCode}'; provider symbol resolution failed`,
    );
  }
  return formatCode;
}

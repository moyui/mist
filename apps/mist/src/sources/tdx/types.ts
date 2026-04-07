/**
 * Parsed K-line data from mist-datasource /api/tdx/market-data
 * Raw HTTP response {field: {stockCode: [values]}} is parsed into this format
 */
export interface TdxResponse {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
  forwardFactor?: number;
}

/**
 * Real-time snapshot from mist-datasource WebSocket
 * Parsed from WS message {type: "quote", data: {stock_code, snapshot: {...}}}
 */
export interface TdxSnapshot {
  stockCode: string; // e.g., "SH600519"
  now: number; // current price
  open: number;
  high: number;
  low: number;
  lastClose: number; // previous close
  volume: number;
  amount: number;
  timestamp: Date;
}

/**
 * TDX K-line extension fields
 * Maps to KExtensionTdx entity in @app/shared-data
 */
export interface TdxExtension {
  fullCode?: string;
  forwardFactor?: number;
  backwardFactor?: number;
  volumeRatio?: number;
  turnoverRate?: number;
  turnoverAmount?: number;
  totalMarketValue?: number;
  floatMarketValue?: number;
  earningsPerShare?: number;
  priceEarningsRatio?: number;
  priceToBookRatio?: number;
}

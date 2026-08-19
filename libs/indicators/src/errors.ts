/** Pure-boundary error types for the indicator computation core. */
export class IndicatorInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IndicatorInputError';
  }
}

export class IndicatorValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IndicatorValueError';
  }
}

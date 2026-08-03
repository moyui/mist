export class ChanInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChanInputError';
  }
}

export class ChanInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChanInvariantError';
  }
}

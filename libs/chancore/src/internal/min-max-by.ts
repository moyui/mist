interface MinMaxResult {
  readonly min: number;
  readonly max: number;
}

export function minMaxBy<T>(
  items: readonly T[],
  accessor: (item: T) => number,
): MinMaxResult | null {
  if (items.length === 0) {
    return null;
  }

  let min = Infinity;
  let max = -Infinity;
  for (const item of items) {
    const value = accessor(item);
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  return { min, max };
}

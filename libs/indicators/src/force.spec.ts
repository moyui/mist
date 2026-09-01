import {
  computeChanUnitForces,
  computeUnitForces,
  computeUnitDirectionalAreas,
  computeUnitLinePeaks,
} from './index';

describe('computeUnitForces', () => {
  const kTimes = Array.from(
    { length: 40 },
    (_, index) => new Date(Date.UTC(2026, 0, 1, 9, 30) + index * 60_000),
  );

  it('sums histogram values over each unit interval (aligned by begIndex)', () => {
    const histogram = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30
    const begIndex = 10;

    const units = [
      { startTime: kTimes[10], endTime: kTimes[14] }, // histogram[0..4] = 1+2+3+4+5
      // interval entirely after the last kTime -> no intersection -> 0
      {
        startTime: new Date(kTimes[39].getTime() + 60_000),
        endTime: new Date(kTimes[39].getTime() + 120_000),
      },
    ];

    const forces = computeUnitForces(histogram, begIndex, kTimes, units);

    expect(forces).toEqual([15, 0]);
  });

  it('skips positions before begIndex (warm-up)', () => {
    const histogram = Array.from({ length: 30 }, (_, i) => i + 1);
    const begIndex = 10;

    const units = [{ startTime: kTimes[0], endTime: kTimes[4] }]; // fully in warm-up

    const forces = computeUnitForces(histogram, begIndex, kTimes, units);

    expect(forces).toEqual([0]);
  });

  it('clamps the interval to the histogram boundaries', () => {
    const histogram = Array.from({ length: 30 }, (_, i) => i + 1);
    const begIndex = 10;

    // unit covers kTimes[8..25] -> valid part histogram[0..15] = 1+...+16 = 136
    const forces = computeUnitForces(histogram, begIndex, kTimes, [
      { startTime: kTimes[8], endTime: kTimes[25] },
    ]);

    expect(forces).toEqual([136]);
  });

  it('handles empty inputs', () => {
    expect(computeUnitForces([], 0, [], [])).toEqual([]);
    expect(
      computeUnitForces(
        [],
        0,
        [],
        [{ startTime: new Date(), endTime: new Date() }],
      ),
    ).toEqual([0]);
  });

  it('does not mutate its inputs', () => {
    const histogram = [1, 2, 3];
    const units = [{ startTime: kTimes[0], endTime: kTimes[2] }];

    computeUnitForces(histogram, 0, kTimes, units);

    expect(histogram).toEqual([1, 2, 3]);
    expect(units).toEqual([{ startTime: kTimes[0], endTime: kTimes[2] }]);
  });
});

describe('computeUnitDirectionalAreas', () => {
  const kTimes = Array.from(
    { length: 40 },
    (_, index) => new Date(Date.UTC(2026, 0, 1, 9, 30) + index * 60_000),
  );

  it('up unit sums only red (positive) bars', () => {
    const histogram = [3, -2, 5, -1, 4]; // red: 3+5+4 = 12
    const begIndex = 10;
    const units = [
      { startTime: kTimes[10], endTime: kTimes[14] }, // histogram[0..4]
    ];

    const areas = computeUnitDirectionalAreas(
      histogram,
      begIndex,
      kTimes,
      units,
      ['up'],
    );
    expect(areas).toEqual([12]);
  });

  it('down unit sums only green (negative) bars as positive magnitude', () => {
    const histogram = [3, -2, 5, -1, 4]; // green: 2+1 = 3
    const begIndex = 10;
    const units = [{ startTime: kTimes[10], endTime: kTimes[14] }];

    const areas = computeUnitDirectionalAreas(
      histogram,
      begIndex,
      kTimes,
      units,
      ['down'],
    );
    expect(areas).toEqual([3]);
  });

  it('ignores opposite-direction bars and warm-up (before begIndex)', () => {
    // unit covers kTimes[8..16]; histogram aligns at begIndex=10 so histogram[0..6] valid.
    // bars: histogram[0..6] = [3, -2, 5, -1, 4, 7, -6]
    // up   -> 3+5+4+7 = 19 ; down -> 2+1+6 = 9
    const histogram = [3, -2, 5, -1, 4, 7, -6];
    const begIndex = 10;

    const up = computeUnitDirectionalAreas(
      histogram,
      begIndex,
      kTimes,
      [{ startTime: kTimes[8], endTime: kTimes[16] }],
      ['up'],
    );
    const down = computeUnitDirectionalAreas(
      histogram,
      begIndex,
      kTimes,
      [{ startTime: kTimes[8], endTime: kTimes[16] }],
      ['down'],
    );
    expect(up).toEqual([19]);
    expect(down).toEqual([9]);
  });

  it('handles empty units and returns 0 when nothing valid', () => {
    expect(computeUnitDirectionalAreas([], 0, [], [], [])).toEqual([]);
    expect(
      computeUnitDirectionalAreas(
        [1],
        0,
        kTimes,
        [
          {
            startTime: new Date(kTimes[39].getTime() + 60_000),
            endTime: new Date(kTimes[39].getTime() + 120_000),
          },
        ],
        ['up'],
      ),
    ).toEqual([0]);
  });
});

describe('computeUnitLinePeaks', () => {
  const kTimes = Array.from(
    { length: 40 },
    (_, index) => new Date(Date.UTC(2026, 0, 1, 9, 30) + index * 60_000),
  );

  it('returns max/min DIF over each unit interval', () => {
    const dif = [1, 5, 3, -2, 7, 4]; // interval kTimes[10..13] -> dif[0..3]
    const begIndex = 10;
    const units = [{ startTime: kTimes[10], endTime: kTimes[13] }];

    const peaks = computeUnitLinePeaks(dif, begIndex, kTimes, units);
    expect(peaks).toEqual([{ max: 5, min: -2 }]);
  });

  it('returns 0 extremes when interval has no valid DIF (warm-up or out of range)', () => {
    const dif = [1, 2, 3];
    const begIndex = 10;

    const warm = computeUnitLinePeaks(dif, begIndex, kTimes, [
      { startTime: kTimes[0], endTime: kTimes[4] },
    ]);
    expect(warm).toEqual([{ max: 0, min: 0 }]);

    const out = computeUnitLinePeaks(dif, begIndex, kTimes, [
      {
        startTime: new Date(kTimes[39].getTime() + 60_000),
        endTime: new Date(kTimes[39].getTime() + 120_000),
      },
    ]);
    expect(out).toEqual([{ max: 0, min: 0 }]);
  });

  it('handles empty units', () => {
    expect(computeUnitLinePeaks([], 0, [], [])).toEqual([]);
  });
});

describe('computeChanUnitForces', () => {
  it('computes unit forces across K-line series and units', () => {
    const klines = Array.from({ length: 50 }, (_, i) => ({
      close: 10 + Math.sin(i / 5) * 2,
      time: new Date(Date.UTC(2026, 0, 1, 9, 30) + i * 60_000),
    }));

    const units = [
      {
        startTime: klines[10].time,
        endTime: klines[25].time,
        trend: 'up',
      },
      {
        startTime: klines[26].time,
        endTime: klines[40].time,
        trend: 'down',
      },
    ];

    const forces = computeChanUnitForces(klines, units);
    expect(forces).toHaveLength(2);
    expect(typeof forces[0].area).toBe('number');
    expect(typeof forces[0].peak).toBe('number');
    expect(forces[0].peak).toBeGreaterThanOrEqual(0);
    expect(forces[1].peak).toBeGreaterThanOrEqual(0);
  });
});

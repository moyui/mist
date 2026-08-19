import { computeUnitForces } from './index';

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

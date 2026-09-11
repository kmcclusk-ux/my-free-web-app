import { describe, expect, it } from 'vitest';
import { MAX_SNAPSHOT_AMOUNT, MAX_SNAPSHOT_YIELD_PERCENT, snapshotNumber } from '../snapshot-calculator/src/numericInput';

describe('snapshot numeric entry', () => {
  it('accepts formatted money, explicit zero and fractional percentage input', () => {
    expect(snapshotNumber('$100,000.25')).toBe(100000.25);
    expect(snapshotNumber('0')).toBe(0);
    expect(snapshotNumber('0.5%', MAX_SNAPSHOT_YIELD_PERCENT)).toBe(0.5);
    expect(snapshotNumber('')).toBe(0);
  });

  it.each(['-1', 'NaN', 'Infinity', '1e999', {}, true, null, '-'])('rejects invalid input instead of crashing tax rendering: %s', value => {
    expect(snapshotNumber(value)).toBeNull();
  });

  it('keeps supported maximum input products inside safe dollar arithmetic', () => {
    expect(snapshotNumber(MAX_SNAPSHOT_AMOUNT + 1)).toBeNull();
    expect(snapshotNumber(MAX_SNAPSHOT_YIELD_PERCENT + 1, MAX_SNAPSHOT_YIELD_PERCENT)).toBeNull();
    expect(MAX_SNAPSHOT_AMOUNT * MAX_SNAPSHOT_YIELD_PERCENT / 100 + MAX_SNAPSHOT_AMOUNT).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});

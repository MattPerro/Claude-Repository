import { describe, expect, it } from 'vitest';
import { formatKgIt, parseDecimalIt, planningHorizon } from '@trackstrong/core';

describe('impianto di test', () => {
  it('formatta i kg con la virgola italiana', () => {
    expect(formatKgIt(12.5)).toBe('12,5 kg');
  });

  it('interpreta la virgola decimale italiana', () => {
    expect(parseDecimalIt('12,5')).toBe(12.5);
    expect(parseDecimalIt('')).toBeNull();
  });

  it('calcola tre anni su date reali', () => {
    const h = planningHorizon('2026-09-21', 3);
    expect(h.endDateExclusive).toBe('2029-09-21');
    expect(h.totalWeeks).toBeGreaterThanOrEqual(156);
  });
});

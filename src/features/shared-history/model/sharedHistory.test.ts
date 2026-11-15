import { describe, expect, it, vi } from 'vitest';

import {
  formatLocalDateTime,
  isDisplayTechnologyName,
  isPublicId,
  isUtcDateTime,
} from './sharedHistory.ts';

describe('sharedHistory model', () => {
  it.each([
    ['1', true],
    ['9223372036854775807', true],
    ['0', false],
    ['01', false],
    ['+1', false],
    ['1.0', false],
    ['9223372036854775808', false],
  ])('validates public ID %s without numeric conversion', (value, expected) => {
    expect(isPublicId(value)).toBe(expected);
  });

  it('counts a Unicode code point as one display character', () => {
    expect(isDisplayTechnologyName('A😀')).toBe(true);
    expect(isDisplayTechnologyName('😀'.repeat(20))).toBe(true);
    expect(isDisplayTechnologyName('😀'.repeat(21))).toBe(false);
  });

  it.each([
    ['2026-02-28T23:59:59Z', true],
    ['2024-02-29T00:00:00.123456Z', true],
    ['2026-02-29T00:00:00Z', false],
    ['2026-01-01T24:00:00Z', false],
    ['2026-01-01T00:00:00.1234567Z', false],
    ['2026-01-01T00:00:00+09:00', false],
    [123, false],
  ])('validates UTC date-time %s', (value, expected) => {
    expect(isUtcDateTime(value)).toBe(expected);
  });

  it('formats a valid instant in the local time zone', () => {
    vi.stubEnv('TZ', 'UTC');
    expect(formatLocalDateTime('2026-01-02T03:04:05Z')).toBe('2026年1月2日 03:04');
    vi.unstubAllEnvs();
  });
});

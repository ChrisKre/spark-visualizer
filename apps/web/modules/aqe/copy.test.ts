import { describe, expect, it } from 'vitest';
import { SETUP, SUMMARY, TAKEAWAY, TITLE } from './copy';

describe('aqe copy', () => {
  it('every string is non-empty', () => {
    for (const value of [TITLE, SUMMARY, SETUP, TAKEAWAY]) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

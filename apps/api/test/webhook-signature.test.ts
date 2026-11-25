import { describe, expect, it } from 'vitest';
import {
  nextAttemptDelaySeconds,
  sign,
  verify,
} from '../src/integrations/core/webhook-signature.js';

describe('webhook signatures', () => {
  const body = JSON.stringify({ eventId: 'e1', type: 'plate.checked.v1' });

  it('verifies its own signature', () => {
    const header = sign('s3cret', body, 1_800_000_000);
    expect(header).toMatch(/^t=1800000000,v1=[0-9a-f]{64}$/);
    expect(verify('s3cret', body, header, 1_800_000_010)).toBe(true);
  });

  it('rejects a changed body, a wrong secret, a missing header and a replay', () => {
    const header = sign('s3cret', body, 1_800_000_000);
    expect(verify('s3cret', `${body} `, header, 1_800_000_000)).toBe(false);
    expect(verify('other', body, header, 1_800_000_000)).toBe(false);
    expect(verify('s3cret', body, undefined)).toBe(false);
    expect(verify('s3cret', body, header, 1_800_000_000 + 301)).toBe(false);
  });

  it('retries with growing waits and gives up within 24 hours', () => {
    const delays: number[] = [];
    for (let i = 0; ; i++) {
      const d = nextAttemptDelaySeconds(i);
      if (d === null) break;
      delays.push(d);
    }
    expect(delays).toEqual([...delays].sort((a, b) => a - b));
    expect(delays.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(24 * 3600);
  });
});

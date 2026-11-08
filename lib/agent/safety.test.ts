import { describe, expect, it } from 'vitest';
import { checkReply, safeReply } from './safety';

const allowed = [6000, 1500];

describe('checkReply', () => {
  it.each([
    'Sorry about the cracked mugs. Let me look at your order.',
    'Your $60 mug set was delivered on the 20th.',
    'We can offer $15.00 for the damage.',
    'That is 60 dollars for the set.',
  ])('allows %s', (text) => {
    expect(checkReply(text, allowed).ok).toBe(true);
  });

  it.each([
    ['an amount the engine did not produce', 'I will refund you $500 right away.'],
    ['an amount written as words', 'We will send 500 dollars.'],
    ['a thousands amount', 'You are owed $1,000.'],
    ['a link', 'Please see https://evil.example/refund for details.'],
    ['a claimed refund', "I've issued a refund to your PayPal."],
    ['a claimed refund, passive', 'Your refund has been processed.'],
  ])('rejects %s', (_, text) => {
    expect(checkReply(text, allowed).ok).toBe(false);
  });
});

describe('safeReply', () => {
  it('swaps an unsafe reply for the fallback', () => {
    expect(safeReply('Refund $500 now', allowed, 'fallback')).toMatchObject({ text: 'fallback', replaced: true });
  });

  it('keeps a safe reply untouched', () => {
    expect(safeReply('Sorry to hear that.', allowed, 'fallback')).toEqual({ text: 'Sorry to hear that.', replaced: false });
  });
});

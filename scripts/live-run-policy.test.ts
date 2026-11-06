import { describe, expect, it } from 'vitest';
import { exitCodeFor, resolveMode, type ResultRow } from './live-run-policy.ts';

const row = (pass: boolean | null): ResultRow => ({ id: 'x', check: 'c', pass, detail: '' });

describe('resolveMode', () => {
  it('replays when no mode is given', () => expect(resolveMode(undefined)).toBe('replay'));
  it('goes live only when asked', () => expect(resolveMode('live')).toBe('live'));
  it('rejects any other word', () => expect(() => resolveMode('record')).toThrow('live or replay'));
});

describe('exitCodeFor', () => {
  it('passes when every row passes', () => expect(exitCodeFor([row(true)], 'live')).toBe(0));
  it('fails on a failed row in either mode', () => {
    expect(exitCodeFor([row(true), row(false)], 'replay')).toBe(1);
    expect(exitCodeFor([row(true), row(false)], 'live')).toBe(1);
  });
  it('fails a live run that left a row not run', () => expect(exitCodeFor([row(true), row(null)], 'live')).toBe(1));
  it('lets a replay leave live-only rows not run', () => expect(exitCodeFor([row(true), row(null)], 'replay')).toBe(0));
});

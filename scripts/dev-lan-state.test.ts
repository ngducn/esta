import { describe, expect, it } from 'vitest';
import { liveState } from './dev-lan-state.ts';

const raw = JSON.stringify({ pid: 4242, lan: '192.168.1.7' });

describe('liveState', () => {
  it('returns the state when its pid runs dev-lan', () => {
    expect(liveState(raw, () => 'node /repo/scripts/dev-lan.ts')).toEqual({ pid: 4242, lan: '192.168.1.7' });
  });

  it('ignores a pid that no longer exists', () => {
    expect(liveState(raw, () => undefined)).toBeUndefined();
  });

  it('ignores a pid that the OS reused for another program', () => {
    expect(liveState(raw, () => '/Applications/Safari.app/Contents/MacOS/Safari')).toBeUndefined();
  });

  it('ignores a shell whose command line only mentions dev-lan', () => {
    expect(liveState(raw, () => "/bin/zsh -c 'ESTA_SLOT=13 node scripts/dev-lan.ts'")).toBeUndefined();
  });

  it('accepts dev-lan started by node with an absolute path', () => {
    expect(liveState(raw, () => '/opt/homebrew/bin/node /repo/scripts/dev-lan.ts')).toBeDefined();
  });

  it('ignores a missing or unreadable state file', () => {
    expect(liveState(undefined, () => 'node scripts/dev-lan.ts')).toBeUndefined();
    expect(liveState('{"pid":"x"}', () => 'node scripts/dev-lan.ts')).toBeUndefined();
    expect(liveState('not json', () => 'node scripts/dev-lan.ts')).toBeUndefined();
  });
});

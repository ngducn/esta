import { describe, expect, it } from 'vitest';
import { classify, probeSql, verdict, type ProbeFunction } from './probe-denied-functions.ts';

const fn = (over: Partial<ProbeFunction> = {}): ProbeFunction => ({ name: 'public.log_export_downloads', kind: 'f', args: ['uuid', 'uuid[]'], anon: false, authenticated: true, ...over });

describe('probeSql', () => {
  it('calls the function as the role with arguments of the declared types', () => {
    expect(probeSql('anon', fn())).toBe('do $probe$ begin set local role anon; perform public.log_export_downloads(null::uuid, null::uuid[]); end $probe$');
  });

  it('gives text a value so a strict immutable function is not folded away before the permission check', () => {
    expect(probeSql('anon', fn({ name: 'public.esta_unaccent', args: ['text'] }))).toContain("public.esta_unaccent('x'::text)");
  });

  it('calls a procedure with call', () => {
    expect(probeSql('authenticated', fn({ kind: 'p', args: [] }))).toContain('call public.log_export_downloads()');
  });
});

describe('classify', () => {
  it('reads permission denied as the pass', () => {
    expect(classify(1, 'failed to execute query: ERROR: permission denied for function f (SQLSTATE 42501)')).toBe('denied');
  });

  it.each([['query error: unexpected EOF'], ['FATAL: the database system is in recovery mode (SQLSTATE 57P03)'], ['server closed the connection unexpectedly']])('reads %s as a crash', (output) => {
    expect(classify(1, output)).toBe('crashed');
  });

  it('does not count a call the probe could not build as a crash', () => {
    expect(classify(1, 'ERROR: could not determine polymorphic type (SQLSTATE 42P18)')).toBe('unprobed');
  });

  it('does not count a call that ran as a denial', () => {
    expect(classify(0, '[]')).toBe('unprobed');
  });
});

describe('verdict', () => {
  it('passes when every denied call answered and nothing restarted', () => {
    expect(verdict({ probed: 3, denied: 3, crashed: [], unprobed: [], restarts: 0 }).pass).toBe(true);
  });

  it('fails on one crash even when the other calls were denied', () => {
    expect(verdict({ probed: 3, denied: 2, crashed: ['anon public.f'], unprobed: [], restarts: 1 }).pass).toBe(false);
  });

  it('fails when the server restarted after an answer', () => {
    expect(verdict({ probed: 1, denied: 1, crashed: [], unprobed: [], restarts: 1 }).pass).toBe(false);
  });
});

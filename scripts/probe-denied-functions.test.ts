import { describe, expect, it } from 'vitest';
import { checkProbeTarget, classify, classifyRest, probeSql, restBody, verdict, type ProbeFunction } from './probe-denied-functions.ts';

const fn = (over: Partial<ProbeFunction> = {}): ProbeFunction => ({ name: 'public.log_export_downloads', kind: 'f', args: ['uuid', 'uuid[]'], argNames: ['p_a', 'p_b'], anon: false, authenticated: true, ...over });

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

describe('classify, what counts as a denial', () => {
  it.each([['ERROR: permission denied to set role "anon" (SQLSTATE 42501)'], ['ERROR: permission denied for schema private (SQLSTATE 42501)']])('does not read %s as a denied call', (output) => {
    expect(classify(1, output)).toBe('unprobed');
  });

  it('reads permission denied for a procedure as the pass', () => {
    expect(classify(1, 'ERROR: permission denied for procedure p (SQLSTATE 42501)')).toBe('denied');
  });
});

describe('classifyRest', () => {
  it('reads PostgREST permission denied as the pass', () => {
    expect(classifyRest(0, '{"code":"42501","message":"permission denied for function claim_pending_invites"}\n401')).toBe('denied');
  });

  it.each([[52, ''], [0, 'bad gateway\n502']])('reads curl %s with %j as a crash', (status, output) => {
    expect(classifyRest(status, output)).toBe('crashed');
  });

  it('does not count a function PostgREST could not find as a denial', () => {
    expect(classifyRest(0, '{"code":"PGRST202"}\n404')).toBe('unprobed');
  });
});

describe('restBody', () => {
  it('names every argument so PostgREST finds the function, with text given a value', () => {
    expect(restBody(fn({ args: ['text', 'uuid'], argNames: ['p_token', 'p_id'] }))).toBe('{"p_token":"x","p_id":null}');
  });
});

const both = { anon: 2, authenticated: 1 };

describe('verdict', () => {
  it('passes when every denied call answered and nothing restarted', () => {
    expect(verdict({ probed: 3, denied: both, crashed: [], unprobed: [], restarts: 0 }).pass).toBe(true);
  });

  it('fails on one crash even when the other calls were denied', () => {
    expect(verdict({ probed: 3, denied: { anon: 1, authenticated: 1 }, crashed: ['anon public.f'], unprobed: [], restarts: 1 }).pass).toBe(false);
  });

  it('fails when the server restarted after an answer', () => {
    expect(verdict({ probed: 3, denied: both, crashed: [], unprobed: [], restarts: 1 }).pass).toBe(false);
  });

  it('fails when nothing was probed', () => {
    expect(verdict({ probed: 0, denied: { anon: 0, authenticated: 0 }, crashed: [], unprobed: [], restarts: 0 }).pass).toBe(false);
  });

  it('fails when one role had no denied call', () => {
    expect(verdict({ probed: 2, denied: { anon: 2, authenticated: 0 }, crashed: [], unprobed: [], restarts: 0 }).pass).toBe(false);
  });
});

describe('checkProbeTarget', () => {
  const preview = { ESTA_PREVIEW_PROJECT_REF: 'abcpreview' };
  const direct = (ref: string) => `postgresql://postgres:s3cret@db.${ref}.supabase.co:5432/postgres`;

  it('allows a local database', () => {
    expect(checkProbeTarget('postgresql://postgres:postgres@127.0.0.1:54322/postgres', {})).toEqual({ host: '127.0.0.1:54322', local: true });
  });

  it('allows the preview project, direct and through the pooler', () => {
    expect(checkProbeTarget(direct('abcpreview'), preview)).toMatchObject({ local: false });
    expect(checkProbeTarget('postgresql://postgres.abcpreview:s3cret@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres', preview)).toMatchObject({ local: false });
  });

  it('refuses ESTA_ENV=production even for a local database', () => {
    expect(checkProbeTarget('postgresql://postgres:postgres@127.0.0.1:54322/postgres', { ESTA_ENV: 'production' })).toHaveProperty('refusal');
  });

  it('refuses another cloud project, the production project and a missing preview ref', () => {
    expect(checkProbeTarget(direct('someoneelse'), preview)).toEqual({ refusal: 'Refusing: --db-url points at project someoneelse, not the preview project abcpreview' });
    expect(checkProbeTarget(direct('abcpreview'), { ...preview, ESTA_PRODUCTION_PROJECT_REF: 'abcpreview' })).toEqual({ refusal: 'Refusing: project abcpreview is the production project' });
    expect(checkProbeTarget(direct('abcpreview'), {})).toEqual({ refusal: 'Refusing: ESTA_PREVIEW_PROJECT_REF is not set' });
  });

  it('refuses a host that is neither local nor a Supabase project', () => {
    expect(checkProbeTarget('postgresql://postgres:s3cret@db.example.com:5432/postgres', preview)).toHaveProperty('refusal');
  });

  it('refuses a malformed URL without printing it or its password', () => {
    const result = checkProbeTarget('postgresql://postgres:s3cret@@db:abc/postgres', preview);
    expect(result).toEqual({ refusal: 'Refusing: --db-url is not a postgres:// URL' });
    expect(JSON.stringify(result)).not.toContain('s3cret');
  });

  it('refuses an api url that is not the same project', () => {
    expect(checkProbeTarget(direct('abcpreview'), preview, 'https://other.supabase.co')).toHaveProperty('refusal');
    expect(checkProbeTarget(direct('abcpreview'), preview, 'https://abcpreview.supabase.co')).toMatchObject({ local: false });
  });
});

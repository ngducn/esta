import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calledJobScripts, jobScriptProblems, jobScriptsOnDisk, parseWorkflow, scriptsCalledBy, securityProblems } from './ci-workflow-rules.ts';

const root = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const ciText = read('.github/workflows/ci.yml');
const SHA = 'a'.repeat(40);

const workflow = (body: string, on = '[pull_request]') => `on: ${on}\npermissions:\n  contents: read\njobs:\n${body}`;
const job = (steps: string) => `  one:\n    steps:\n${steps}`;
const problems = (text: string) => securityProblems(parseWorkflow(text), text);

describe('ci.yml', () => {
  it('keeps the rules CLAUDE.md states for CI', () => {
    expect(securityProblems(parseWorkflow(ciText), ciText)).toEqual([]);
  });

  it('runs every project step through a tools/ci/jobs script', () => {
    expect(jobScriptProblems(parseWorkflow(ciText))).toEqual([]);
  });

  it('calls only job scripts that exist', () => {
    expect(calledJobScripts(parseWorkflow(ciText)).filter((path) => !jobScriptsOnDisk(root).includes(path))).toEqual([]);
  });

  it('calls every job script on disk', () => {
    expect(calledJobScripts(parseWorkflow(ciText))).toEqual(jobScriptsOnDisk(root));
  });

  it('is the same set of job scripts tools/ci-local.sh runs', () => {
    expect(scriptsCalledBy(read('tools/ci-local.sh'))).toEqual(jobScriptsOnDisk(root));
  });
});

describe('the composite setup action', () => {
  it('pins every action by a full SHA', () => {
    const uses = [...read('.github/actions/setup/action.yml').matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((match) => match[1] ?? '');
    expect(uses.length).toBeGreaterThan(0);
    expect(uses.filter((value) => !/@[0-9a-f]{40}$/.test(value))).toEqual([]);
  });
});

describe('securityProblems', () => {
  it('fails a checkout that pins the pull request head', () => {
    const text = workflow(job(`      - uses: actions/checkout@${SHA}\n        with:\n          ref: \${{ github.event.pull_request.head.sha || github.sha }}\n`));
    expect(problems(text).join('\n')).toContain('merge result');
  });

  it('fails an action pinned by a tag or a short SHA', () => {
    expect(problems(workflow(job('      - uses: actions/checkout@v4\n'))).join('\n')).toContain('not pinned');
    expect(problems(workflow(job('      - uses: actions/checkout@3d3c42e\n'))).join('\n')).toContain('not pinned');
  });

  it('passes a local action and an action pinned by a full SHA', () => {
    expect(problems(workflow(job(`      - uses: actions/checkout@${SHA} # v7\n      - uses: ./.github/actions/setup\n`)))).toEqual([]);
  });

  it('fails pull_request_target, as an event or anywhere in the text', () => {
    expect(problems(workflow(job('      - run: tools/ci/jobs/check.sh\n'), '[pull_request, pull_request_target]')).join('\n')).toContain('pull_request_target');
    expect(problems(workflow(job('      - run: echo pull_request_target\n'))).join('\n')).toContain('pull_request_target');
  });

  it('fails a workflow that does not run on pull_request', () => {
    expect(problems(workflow(job('      - run: tools/ci/jobs/check.sh\n'), '[push]')).join('\n')).toContain('does not run on pull_request');
  });

  it('fails a write token and a secret', () => {
    const write = `on: [pull_request]\npermissions:\n  contents: write\njobs:\n${job('      - run: tools/ci/jobs/check.sh\n')}`;
    expect(problems(write).join('\n')).toContain('read-only');
    expect(problems(workflow(job('      - run: echo ${{ secrets.TOKEN }}\n'))).join('\n')).toContain('secret');
  });
});

describe('jobScriptProblems', () => {
  const check = (steps: string) => jobScriptProblems(parseWorkflow(workflow(job(steps))));

  it('fails a step that runs project commands inline', () => {
    expect(check('      - run: pnpm check\n').join('\n')).toContain('pnpm check');
    expect(check('      - run: |\n          pnpm db:test\n          pnpm db:types\n')).toHaveLength(1);
  });

  it('passes a job script, with arguments and environment', () => {
    expect(check('      - run: tools/ci/jobs/e2e.sh $PROJECTS --shard="$SHARD"\n')).toEqual([]);
  });

  it('passes a single call of another tools/ci helper and fails a helper that carries pnpm work', () => {
    expect(check('      - run: tools/ci/images.sh load ~/.cache/supabase-images\n')).toEqual([]);
    expect(check('      - run: tools/ci/e2e-report.sh all-blob-reports\n')).toEqual([]);
    expect(check('      - run: pnpm db:test && tools/ci/images.sh save x\n')).toHaveLength(1);
  });

  it('leaves the aggregate ci job alone and checks any other job', () => {
    const text = workflow('  ci:\n    steps:\n      - run: echo done\n  other:\n    steps:\n      - run: echo done\n');
    expect(jobScriptProblems(parseWorkflow(text))).toHaveLength(1);
  });
});

describe('scriptsCalledBy', () => {
  it('lists a job script once however often it is named', () => {
    expect(scriptsCalledBy('tools/ci/jobs/db.sh\ntools/ci/jobs/db.sh\ntools/ci/jobs/check.sh')).toEqual(['tools/ci/jobs/check.sh', 'tools/ci/jobs/db.sh']);
  });

  it('misses a job script that the local CI does not name', () => {
    expect(scriptsCalledBy('tools/ci/jobs/check.sh')).not.toEqual(jobScriptsOnDisk(root));
  });
});

describe('shell scripts under tools', () => {
  const walk = (dir: string): string[] =>
    readdirSync(join(root, dir)).flatMap((name) => {
      const path = `${dir}/${name}`;
      if (statSync(join(root, path)).isDirectory()) return name === 'fixtures' ? [] : walk(path);
      return name.endsWith('.sh') ? [path] : [];
    });
  const scripts = walk('tools');

  it('finds the scripts', () => {
    expect(scripts).toEqual(expect.arrayContaining(['tools/ci-local.sh', 'tools/ci/jobs/db.sh', 'tools/heavy.sh', 'tools/lock.sh']));
  });

  it.each(scripts)('%s parses with bash', (path) => {
    expect(spawnSync('bash', ['-n', join(root, path)], { encoding: 'utf8' }).stderr).toBe('');
  });

  it.each(scripts)('%s uses nothing that bash 3.2 on macOS lacks', (path) => {
    expect(read(path)).not.toMatch(/\b(mapfile|readarray)\b|declare\s+-A\b/);
  });
});

describe('tools/heavy.sh', () => {
  const run = (dir: string, ...command: string[]) =>
    spawnSync(join(root, 'tools', 'heavy.sh'), command, { encoding: 'utf8', env: { ...process.env, CI_LOCAL_DIR: dir }, cwd: tmpdir(), timeout: 30_000 });

  it('runs the command, returns its status and leaves no lock behind', () => {
    const dir = mkdtempSync(join(tmpdir(), 'heavy-'));
    expect(run(dir, 'sh', '-c', 'echo ran; exit 3')).toMatchObject({ status: 3, stdout: 'ran\n' });
    expect(run(dir, 'true').status).toBe(0);
    expect(existsSync(join(dir, 'root.lock'))).toBe(false);
    expect(existsSync(join(dir, 'root.lock2'))).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('takes both locks for the command, so nothing else runs beside it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'heavy-'));
    const held = run(dir, 'sh', '-c', `ls "${dir}" | grep -c '^root.lock'`);
    expect(held.stdout.trim()).toBe('2');
    rmSync(dir, { recursive: true, force: true });
  });
});

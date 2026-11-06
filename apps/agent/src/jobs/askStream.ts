import { checkNote, type FactSheet, type FilledNote, type NoteViolation } from '@esta/core/guard';
import type { AnswerRef, CalcRef, SourceRef } from '@esta/core/assistant';
import type { IsoDate } from '@esta/core/date';
import type { Result } from '@esta/core/result';
import { CALC_OPERANDS } from '../tools/fact-sheet';

export const FLUSH_MS = 300;

// The live probe saw the handle written as a placeholder too, `]({{f8}})` or `]({{f3.handle}})` (P5-12).
const HANDLE_LINK = /\]\((?:(f\d+)|\{\{(f\d+)(?:\.handle)?\}\})\)/g;

export type Answer = FilledNote & { readonly refs: readonly AnswerRef[] };

/**
 * Swaps each `](fN)` the model wrote for that record's link, in the template before any value is filled, so a cited
 * name that holds `](f2)` stays text. `refs` lists what was swapped in, the only links an answer shows live.
 */
export function resolveLinks(text: string, sheet: FactSheet): { readonly text: string; readonly refs: string[] } {
  const refs = new Set<string>();
  const resolved = text.replace(HANDLE_LINK, (whole, bare: string | undefined, braced: string | undefined) => {
    const link = sheet.get(bare ?? braced ?? '')?.link;
    if (typeof link !== 'string') return whole;
    refs.add(link);
    return `](${link})`;
  });
  return { text: resolved, refs: [...refs] };
}

const CITED_HANDLE = /\{\{(f\d+)\./g;

/** The pages the template cites through a source record's fields, numbered in the order it first cites them. */
export function sourceRefs(template: string, sheet: FactSheet): SourceRef[] {
  const sources: SourceRef[] = [];
  for (const [, handle = ''] of template.matchAll(CITED_HANDLE)) {
    const record = sheet.get(handle);
    if (typeof record?.source_url !== 'string' || sources.some(({ url }) => url === record.source_url)) continue;
    sources.push({ kind: 'source', n: sources.length + 1, url: record.source_url, source_name: String(record.source_name), published_on: typeof record.published_on === 'string' ? (record.published_on as IsoDate) : null });
  }
  return sources;
}

/** Every handle a calculation result rests on, itself included, by walking the operand handles `calculate` kept. */
function calculationsBehind(handles: Iterable<string>, sheet: FactSheet): Set<string> {
  const seen = new Set<string>();
  const queue = [...handles];
  for (let handle = queue.pop(); handle !== undefined; handle = queue.pop()) {
    if (seen.has(handle)) continue;
    seen.add(handle);
    const from = (sheet.get(handle) as Record<symbol, unknown> | undefined)?.[CALC_OPERANDS];
    if (Array.isArray(from)) queue.push(...from.filter((operand): operand is string => typeof operand === 'string'));
  }
  return seen;
}

const handleNumber = (handle: string): number => Number(handle.slice(1));

/** The working of each calculation the template cites and each one those results were worked out from, in the order they ran (handles are numbered in call order). */
export function calcRefs(template: string, sheet: FactSheet): CalcRef[] {
  const cited = [...template.matchAll(CITED_HANDLE)].map(([, handle = '']) => handle);
  return [...calculationsBehind(cited, sheet)]
    .sort((a, b) => handleNumber(a) - handleNumber(b))
    .flatMap((handle) => {
      const working = sheet.get(handle)?.working_display;
      return typeof working === 'string' ? [{ kind: 'calc' as const, working }] : [];
    });
}

/** A line holding only an ordered list's number, such as `1.`. A cut at its `.` would read as a typed number until the item's text comes. */
const LIST_MARKER = /^[ \t]*\d{1,9}$/;

function lastSentenceEnd(template: string): number {
  let cut = 0;
  let brackets = 0;
  let braces = 0;
  for (let at = 0; at < template.length; at += 1) {
    const [here, next] = [template[at] ?? '', template[at + 1]];
    if (here === '.' && LIST_MARKER.test(template.slice(template.lastIndexOf('\n', at - 1) + 1, at))) continue;
    if (here === '[') brackets += 1;
    else if (here === ']') brackets -= 1;
    else if (here === '{' && next === '{') braces += 1;
    else if (here === '}' && next === '}') braces -= 1;
    const ends = here === '\n' || ('.?!…:'.includes(here) && next !== undefined && /\s/.test(next));
    if (ends && brackets <= 0 && braces <= 0) cut = at + 1;
  }
  return cut;
}

/** The guard reads the answer as Hỏi renders it, tables included, with its links resolved, so the 4,000-character limit counts them (#335). */
function guarded(template: string, sheet: FactSheet): Result<Answer, NoteViolation[]> {
  const linked = resolveLinks(template, sheet);
  const checked = checkNote(template, sheet, 'markdown-tables', linked.text);
  return checked.ok ? { ok: true, value: { ...checked.value, refs: [...linked.refs, ...sourceRefs(template, sheet), ...calcRefs(template, sheet)] } } : checked;
}

export type AnswerText = { readonly content: string; readonly refs: readonly AnswerRef[] };

export type AnswerStream = {
  push(delta: string): Promise<void>;
  end(): Promise<Result<Answer, NoteViolation[]>>;
  restart(): void;
  readonly template: () => string;
};

export function answerStream({ sheet, write, flushMs = FLUSH_MS, now = Date.now }: { sheet: FactSheet; write(answer: AnswerText): Promise<void>; flushMs?: number; now?: () => number }): AnswerStream {
  let template = '';
  let checkedTo = 0;
  let violated = false;
  let accepted: AnswerText = { content: '', refs: [] };
  let written: string | null = null;
  let lastWrite = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();
  let failure: unknown = null;

  const flush = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (accepted.content === written) return writing;
    const answer = accepted;
    written = answer.content;
    lastWrite = now();
    writing = writing.then(() => write(answer)).catch((error: unknown) => {
      failure ??= error;
    });
    return writing;
  };
  const schedule = () => {
    if (timer !== undefined) return;
    const wait = lastWrite + flushMs - now();
    if (wait <= 0) void flush();
    else timer = setTimeout(() => void flush(), wait);
  };

  return {
    async push(delta) {
      template += delta;
      if (violated) return;
      const cut = lastSentenceEnd(template);
      if (cut <= checkedTo) return;
      checkedTo = cut;
      const prefix = guarded(template.slice(0, cut).trimEnd(), sheet);
      if (!prefix.ok) {
        violated = true;
        return;
      }
      accepted = { content: prefix.value.text, refs: prefix.value.refs };
      schedule();
      if (failure !== null) throw failure;
    },
    async end() {
      const whole = guarded(template.trim(), sheet);
      if (whole.ok) accepted = { content: whole.value.text, refs: whole.value.refs };
      await flush();
      if (failure !== null) throw failure;
      return whole;
    },
    restart() {
      template = '';
      checkedTo = 0;
      violated = false;
    },
    template: () => template,
  };
}

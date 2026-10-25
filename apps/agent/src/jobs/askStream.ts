import { checkNote, type FactSheet, type FilledNote, type NoteViolation } from '@esta/core/guard';
import type { Result } from '@esta/core/result';

export const FLUSH_MS = 300;

/** The model links a record by its handle, `[Sổ thu chi](f3)`; only a record of this run with a link becomes one. */
const HANDLE_LINK = /\]\((f\d+)\)/g;

export type Answer = FilledNote & { readonly refs: readonly string[] };

/** Each handle link to a record this run returned becomes that record's `esta://` link; any other stays a bare word the page shows as text. */
export function resolveLinks(text: string, sheet: FactSheet): { readonly text: string; readonly refs: string[] } {
  const refs = new Set<string>();
  const resolved = text.replace(HANDLE_LINK, (whole, handle: string) => {
    const link = sheet.get(handle)?.link;
    if (typeof link !== 'string') return whole;
    refs.add(link);
    return `](${link})`;
  });
  return { text: resolved, refs: [...refs] };
}

/** Where the text may be cut: after a sentence's end mark or a line break, outside an open link text or placeholder. */
function lastBoundary(template: string): number {
  let cut = 0;
  let brackets = 0;
  let braces = 0;
  for (let at = 0; at < template.length; at += 1) {
    const [here, next] = [template[at] ?? '', template[at + 1]];
    if (here === '[') brackets += 1;
    else if (here === ']') brackets -= 1;
    else if (here === '{' && next === '{') braces += 1;
    else if (here === '}' && next === '}') braces -= 1;
    const ends = here === '\n' || ('.?!…:'.includes(here) && next !== undefined && /\s/.test(next));
    if (ends && brackets <= 0 && braces <= 0) cut = at + 1;
  }
  return cut;
}

function guarded(template: string, sheet: FactSheet): Result<Answer, NoteViolation[]> {
  const checked = checkNote(template, sheet, 'markdown');
  if (!checked.ok) return checked;
  const { text, refs } = resolveLinks(checked.value.text, sheet);
  return { ok: true, value: { ...checked.value, text, refs } };
}

export type AnswerStream = {
  /** Adds model text. Each time a sentence ends, the whole text so far is guarded, and only text that passes is shown. */
  push(delta: string): Promise<void>;
  /** Guards the whole answer and writes it; after a violation the row keeps the last text that passed. */
  end(): Promise<Result<Answer, NoteViolation[]>>;
  /** Starts the answer over for a repair turn; its first passing sentence replaces what the row shows. */
  restart(): void;
  /** What the model wrote, for the operator item and the job result. */
  readonly template: () => string;
};

/**
 * The guard on a streamed answer (AGENT.md §5.6, §6.3). Model text is buffered to a sentence boundary, and the whole
 * prefix up to it is filled and guarded against the records the tools returned so far, so no partial placeholder,
 * partial sentence or rejected word reaches the row. A violating sentence stops what is shown there, because every
 * longer prefix holds it too. Writes go out at most every `flushMs`, one at a time, latest text winning.
 */
export function answerStream({ sheet, write, flushMs = FLUSH_MS, now = Date.now }: { sheet: FactSheet; write(content: string): Promise<void>; flushMs?: number; now?: () => number }): AnswerStream {
  let template = '';
  let checkedTo = 0;
  let accepted = '';
  let written: string | null = null;
  let lastWrite = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let writing: Promise<void> = Promise.resolve();
  let failure: unknown = null;

  const flush = (): Promise<void> => {
    clearTimeout(timer);
    timer = undefined;
    if (accepted === written) return writing;
    const content = accepted;
    written = content;
    lastWrite = now();
    writing = writing.then(() => write(content)).catch((error: unknown) => {
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
      const cut = lastBoundary(template);
      if (cut <= checkedTo) return;
      checkedTo = cut;
      const prefix = guarded(template.slice(0, cut).trimEnd(), sheet);
      if (!prefix.ok) return;
      accepted = prefix.value.text;
      schedule();
      if (failure !== null) throw failure;
    },
    async end() {
      const whole = guarded(template.trim(), sheet);
      if (whole.ok) accepted = whole.value.text;
      await flush();
      if (failure !== null) throw failure;
      return whole;
    },
    restart() {
      template = '';
      checkedTo = 0;
    },
    template: () => template,
  };
}

'use client';

import type { DocumentCategory } from '@esta/core/documents';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { checkFile, prepareCapture, prepareFile, sendPrepared, type PickProblem, type Prepared } from '@/lib/upload/prepare';
import { createDocumentUpload, type UploadTicket } from '@/server/documents/actions';
import type { CombinedCapture } from './multi-page-capture';

export type Ticket = Extract<UploadTicket, { ok: true }>;
export type UploadTarget = { readonly propertyId: string; readonly category: DocumentCategory };

/**
 * A document file from the moment it is picked until its bytes and previews are in Storage and `finish` has run.
 * Each step names what a form shows beside its own fields.
 */
export type Upload =
  | { readonly step: 'empty' }
  | { readonly step: 'preparing'; readonly file: File | null }
  | { readonly step: 'refused'; readonly file: File | null; readonly problem: PickProblem }
  | { readonly step: 'ready'; readonly prepared: Prepared }
  | { readonly step: 'signing'; readonly prepared: Prepared }
  | { readonly step: 'duplicate'; readonly prepared: Prepared; readonly duplicates: Ticket['duplicates'] }
  | { readonly step: 'uploading'; readonly prepared: Prepared; readonly loaded: number; readonly total: number }
  | { readonly step: 'failed'; readonly prepared: Prepared }
  | { readonly step: 'sent'; readonly prepared: Prepared; readonly documentId: string };

type Options = {
  readonly initialFile?: File | null;
  /** Writes what the file is for once it is in Storage, such as its document row; false leaves it to `Thử lại`. */
  readonly finish?: (ticket: Ticket, prepared: Prepared) => Promise<boolean>;
  /** A receipt photo: sent here the moment it is prepared, so it travels while Mẹ types, and never asks about a duplicate. */
  readonly eager?: UploadTarget;
};

function initial(file: File | null): Upload {
  if (file === null) return { step: 'empty' };
  const problem = checkFile(file);
  return problem === null ? { step: 'preparing', file } : { step: 'refused', file, problem };
}

/**
 * The one upload flow of a document file (DOC-1). A newer pick supersedes an older one still in flight. A failed
 * upload keeps its signed ticket, so `Thử lại` signs nothing new and sends the bytes again only when they never
 * arrived.
 */
export function useDocumentUpload({ initialFile = null, finish, eager }: Options = {}) {
  const [upload, setUpload] = useState<Upload>(() => initial(initialFile));
  const latest = useRef(upload);
  const run = useRef(0);
  const held = useRef<{ prepared: Prepared; ticket: Ticket; sent: boolean } | null>(null);
  const inflight = useRef<Promise<void> | null>(null);

  const set = (next: Upload) => {
    latest.current = next;
    setUpload(next);
  };
  const current = (mine: number) => run.current === mine;

  const complete = async (mine: number, prepared: Prepared, ticket: Ticket) => {
    const done = finish === undefined ? true : await finish(ticket, prepared).catch(() => false);
    if (current(mine)) set(done ? { step: 'sent', prepared, documentId: ticket.documentId } : { step: 'failed', prepared });
  };

  const transfer = async (mine: number, prepared: Prepared, ticket: Ticket) => {
    set({ step: 'uploading', prepared, loaded: 0, total: prepared.file.size });
    try {
      await sendPrepared(ticket, prepared, ({ loaded, total }) => {
        if (current(mine)) set({ step: 'uploading', prepared, loaded, total });
      });
    } catch {
      if (current(mine)) set({ step: 'failed', prepared });
      return;
    }
    held.current = { prepared, ticket, sent: true };
    await complete(mine, prepared, ticket);
  };

  const sendFrom = async (mine: number, prepared: Prepared, target: UploadTarget) => {
    const kept = held.current?.prepared === prepared ? held.current : null;
    if (kept !== null) return kept.sent ? complete(mine, prepared, kept.ticket) : transfer(mine, prepared, kept.ticket);
    set({ step: 'signing', prepared });
    const { file, sha256 } = prepared;
    const ticket = await createDocumentUpload({ ...target, filename: file.name, mime: file.type, size: file.size, sha256 }).catch(() => ({ ok: false }) as const);
    if (!current(mine)) return;
    if (!ticket.ok) return set({ step: 'failed', prepared });
    held.current = { prepared, ticket, sent: false };
    if (eager === undefined && ticket.duplicates.length > 0) return set({ step: 'duplicate', prepared, duplicates: ticket.duplicates });
    await transfer(mine, prepared, ticket);
  };

  const prepare = async (mine: number, file: File | null, pending: Promise<Prepared | null>) => {
    set({ step: 'preparing', file });
    const prepared = await pending;
    if (!current(mine)) return;
    if (prepared === null) return set({ step: 'refused', file, problem: 'unreadable' });
    set({ step: 'ready', prepared });
    if (eager !== undefined) await sendFrom(mine, prepared, eager);
  };

  const pick = (file: File) => {
    const mine = ++run.current;
    const problem = checkFile(file);
    inflight.current = problem === null ? prepare(mine, file, prepareFile(file)) : null;
    if (problem !== null) set({ step: 'refused', file, problem });
  };

  const startInitial = useEffectEvent(() => {
    if (initialFile !== null && checkFile(initialFile) === null) inflight.current = prepare(++run.current, initialFile, prepareFile(initialFile));
  });
  useEffect(() => startInitial(), []);

  return {
    upload,
    pick,
    capture: (combined: CombinedCapture) => {
      inflight.current = prepare(++run.current, null, prepareCapture(combined));
    },
    clear: () => {
      run.current++;
      inflight.current = null;
      set({ step: 'empty' });
    },
    /** Signs, asks about a duplicate unless eager, sends and finishes; from `failed` it is `Thử lại`. */
    send: (target: UploadTarget) => {
      const state = latest.current;
      if ('prepared' in state) inflight.current = sendFrom(run.current, state.prepared, target);
    },
    proceed: () => {
      const state = latest.current;
      const kept = held.current;
      if (state.step === 'duplicate' && kept !== null) inflight.current = transfer(run.current, state.prepared, kept.ticket);
    },
    /** `Hủy` on the duplicate question: the next save asks again. */
    dismiss: () => {
      const state = latest.current;
      held.current = null;
      if (state.step === 'duplicate') set({ step: 'ready', prepared: state.prepared });
    },
    /** The upload once the work in flight has finished, which `Lưu` waits for. */
    settled: async (): Promise<Upload> => {
      await inflight.current;
      return latest.current;
    },
  };
}

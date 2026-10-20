'use server';

import type { Result } from '@esta/core/result';
import { runOp, statementCommit, statementImport, statementLink, type StatementCommitted, type StatementImported } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

/** `nothingNew` names the import that already holds every line of the file. */
export type ImportRefusal = { readonly kind: 'nothingNew'; readonly importId: string } | { readonly kind: 'failed' };

/** LSE-8 `Xem trước`: the lines the browser read from the file, matched and stored for the preview. */
export async function importStatement(raw: unknown): Promise<Result<StatementImported, ImportRefusal>> {
  const result = await runOp(statementImport, await webOpContext(), raw);
  if (!result.ok) return { ok: false, reason: result.reason.kind === 'nothing_new' ? { kind: 'nothingNew', importId: result.reason.import_id } : { kind: 'failed' } };
  revalidatePath('/collections/import');
  return result;
}

/** LSE-8 `Ghi sổ`: the memo matches the database does not hold, and the confirmed lines, post as payments. */
export async function commitStatement(raw: unknown): Promise<Result<StatementCommitted, 'failed'>> {
  const result = await runOp(statementCommit, await webOpContext(), raw);
  if (!result.ok) return { ok: false, reason: 'failed' };
  revalidatePath('/collections', 'layout');
  return result;
}

/** LSE-8 `Đã ghi tay`: a held line is the transfer recorded by hand, so that payment takes it and no money is added. */
export async function linkStatementLine(raw: unknown): Promise<Result<StatementCommitted, 'failed'>> {
  const result = await runOp(statementLink, await webOpContext(), raw);
  if (!result.ok) return { ok: false, reason: 'failed' };
  revalidatePath('/collections', 'layout');
  return result;
}

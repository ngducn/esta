import { chosenHeader, guessColumns, guessHeaderRow, type AmountColumns, type ColumnPreset, type DetectedHeader, type MappingReason, type StatementGrid } from '@esta/core/matching';
import type { Result } from '@esta/core/result';

/** The columns a person has picked so far on `ColumnMapping`, as zero-based indexes; `null` is not picked yet. */
export type Picks = {
  readonly headerRow: number;
  readonly date: number | null;
  readonly description: number | null;
  readonly bankRef: number | null;
  readonly split: boolean;
  readonly amount: number | null;
  readonly credit: number | null;
  readonly debit: number | null;
};

export type PicksReason = 'incomplete' | MappingReason;

/** Picks that read exactly as a header does, for changing columns a preset or an earlier choice already gave. */
export function picksOf({ headerRow, mapping }: DetectedHeader): Picks {
  const { amount } = mapping;
  return {
    headerRow,
    date: mapping.date,
    description: mapping.description,
    bankRef: mapping.bankRef,
    split: amount.kind === 'split',
    amount: amount.kind === 'signed' ? amount.amount : null,
    credit: amount.kind === 'split' ? amount.credit : null,
    debit: amount.kind === 'split' ? amount.debit : null,
  };
}

/** The picks a header row suggests: the labels Esta knows, then the labels the account's saved columns used. */
export function guessPicks(grid: StatementGrid, headerRow: number, preset: ColumnPreset | undefined): Picks {
  const guessed = guessColumns(grid[headerRow] ?? [], preset);
  const split = guessed.amount === undefined && (guessed.credit !== undefined || guessed.debit !== undefined || preset?.mapping.amount.kind === 'split');
  return {
    headerRow,
    date: guessed.date ?? null,
    description: guessed.description ?? null,
    bankRef: guessed.bankRef ?? null,
    split,
    amount: guessed.amount ?? null,
    credit: guessed.credit ?? null,
    debit: guessed.debit ?? null,
  };
}

export const firstPicks = (grid: StatementGrid, preset: ColumnPreset | undefined): Picks => guessPicks(grid, guessHeaderRow(grid), preset);

/** The header the picks name, checked against the file by core's `chosenHeader`; incomplete until every needed role has a column. */
export function pickedHeader(grid: StatementGrid, picks: Picks): Result<DetectedHeader, PicksReason> {
  const { headerRow, date, description, bankRef, credit, debit, amount } = picks;
  const columns: AmountColumns | null = picks.split ? (credit === null || debit === null ? null : { kind: 'split', credit, debit }) : amount === null ? null : { kind: 'signed', amount };
  if (date === null || description === null || columns === null) return { ok: false, reason: 'incomplete' };
  return chosenHeader(grid, { headerRow, mapping: { date, description, bankRef, amount: columns } });
}

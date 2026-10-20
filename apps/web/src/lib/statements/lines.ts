import type { IsoDate } from '@esta/core/date';
import type { Vnd } from '@esta/core/money';

/** A line's state as the database reads it (`statement_line_state`): `held` waits for a person, `posted` has its payment. */
export const LINE_STATUSES = ['memo_match', 'suggested', 'held', 'unmatched', 'ignored', 'posted'] as const;
export type LineStatus = (typeof LINE_STATUSES)[number];
export const LINE_REASONS = ['debit', 'duplicate', 'repeat', 'paid', 'void', 'recorded_by_hand'] as const;
export type LineReason = (typeof LINE_REASONS)[number];

/** A bill a line names, as a person recognizes it: the room, the place and the bill number. */
export type BillLabel = { readonly id: string; readonly number: string; readonly unitLabel: string; readonly wholeUnit: boolean; readonly propertyName: string };

export type StatementLine = {
  readonly id: string;
  /** The line of the file, counting the header as 0. */
  readonly index: number;
  readonly date: IsoDate;
  readonly amount: Vnd;
  readonly description: string;
  readonly bankRef: string;
  readonly status: LineStatus;
  readonly reason: LineReason | null;
  /** The matched bill, or each bill a line left for a person could belong to. */
  readonly bills: readonly BillLabel[];
  /** For a held line, the transfer recorded by hand on its bill, and whether `Đã ghi tay` can link the line to it. */
  readonly hand: { readonly receivedOn: IsoDate; readonly amount: Vnd; readonly linkable: boolean } | null;
};

export type RefusedLine = { readonly index: number; readonly field: 'row' | 'date' | 'amount'; readonly reason: string };

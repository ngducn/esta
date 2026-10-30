import { isoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { portfolioWatchRequest } from '../../src/jobs/portfolio-watch';
import { JOBS } from '../../src/jobs/registry';
import { canonicalizer, inputHash, type CanonicalInput } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR, recordingSchema, writeRecording } from '../../src/replay/store';
import { canonicalInput } from '../../src/sdk/session';
import { fakeDb } from '../../src/test/fake-db';
import { mcpToolName } from '../../src/tools/server';
import { CASES, clockOn, HOUSEHOLD, labels, snapshot } from '../full-seed';

type Note = { readonly title: string; readonly body_md: string; readonly related: readonly string[] };

/** What the morning watch writes on the full seed at 2026-10-07 06:40, by hand, until the P5-10 live run records it. */
const NOTES: Record<Locale, { readonly label: string; readonly notes: readonly Note[] }> = {
  vi: {
    label: 'Hand-written for the full seed at 2026-10-07 06:40 (P5-03b); the live recording waits for the P5-10 live run.',
    notes: [
      { title: '{{f1.place_label}} quá hạn {{f1.days_overdue_display}}', body_md: 'Hóa đơn của {{f1.tenant_name}} đến hạn ngày {{f1.due_date_display}} đã quá hạn {{f1.days_overdue_display}}, còn nợ {{f1.outstanding_display}}. Nên nhắc khách đóng tiền.', related: ['f1'] },
      { title: 'Hợp đồng {{f2.place_label}} sắp hết hạn', body_md: 'Hợp đồng với {{f2.tenant_name}} kết thúc ngày {{f2.end_date_display}}, còn {{f2.days_until_end_display}}, và chưa có hợp đồng gia hạn. Nên hỏi khách có muốn thuê tiếp không.', related: ['f2'] },
      { title: 'Chưa hoàn tiền cọc {{f6.place_label}}', body_md: 'Hợp đồng với {{f6.tenant_name}} đã kết thúc ngày {{f6.end_date_display}}, cách đây {{f6.days_since_end_display}}, nhưng tiền cọc {{f6.deposit_held_display}} vẫn đang giữ. Nên quyết toán và hoàn cọc cho khách.', related: ['f6'] },
      {
        title: 'Các việc cần để ý hôm nay',
        body_md: [
          '- {{f3.place_label}} để trống {{f3.days_vacant_display}}, từ ngày {{f3.vacant_since_display}}.',
          '- {{f4.place_label}} để trống {{f4.days_vacant_display}}, từ ngày {{f4.vacant_since_display}}.',
          '- {{f5.document_label}} hết hạn ngày {{f5.expires_on_display}}, còn {{f5.days_until_expiry_display}}.',
          '- Doanh thu cho thuê dự kiến năm {{f7.year_display}} của {{f7.owner_name}} là {{f7.projected_compact}}, bằng {{f7.progress_display}} ngưỡng {{f7.threshold_compact}}.',
          '- Hồ sơ {{f8.place_label}} mới đầy đủ {{f8.completeness_display}}, nên bổ sung giấy tờ.',
        ].join('\n'),
        related: ['f3', 'f4', 'f5', 'f7', 'f8'],
      },
    ],
  },
  en: {
    label: 'Hand-written in English for the full seed at 2026-10-07 06:40 (P5-16a); the live recording waits for the P5-10 live run.',
    notes: [
      { title: '{{f1.place_label}} is {{f1.days_overdue_display}} overdue', body_md: "{{f1.tenant_name}}'s bill was due on {{f1.due_date_display}} and is {{f1.days_overdue_display}} overdue, with {{f1.outstanding_display}} still owed. Remind the tenant to pay.", related: ['f1'] },
      { title: 'The lease for {{f2.place_label}} ends soon', body_md: 'The lease with {{f2.tenant_name}} ends on {{f2.end_date_display}}, in {{f2.days_until_end_display}}, and has no renewal yet. Ask the tenant whether they want to stay.', related: ['f2'] },
      { title: 'Deposit not returned for {{f6.place_label}}', body_md: 'The lease with {{f6.tenant_name}} ended on {{f6.end_date_display}}, now {{f6.days_since_end_display}} ago, but the deposit of {{f6.deposit_held_display}} is still held. Settle the lease and return the deposit.', related: ['f6'] },
      {
        title: 'Things to watch today',
        body_md: [
          '- {{f3.place_label}} has been empty for {{f3.days_vacant_display}}, since {{f3.vacant_since_display}}.',
          '- {{f4.place_label}} has been empty for {{f4.days_vacant_display}}, since {{f4.vacant_since_display}}.',
          '- {{f5.document_label}} expires on {{f5.expires_on_display}}, in {{f5.days_until_expiry_display}}.',
          "- {{f7.owner_name}}'s projected rental income for {{f7.year_display}} is {{f7.projected_compact}}, or {{f7.progress_display}} of the {{f7.threshold_compact}} threshold.",
          '- The file for {{f8.place_label}} is {{f8.completeness_display}} complete; add the missing papers.',
        ].join('\n'),
        related: ['f3', 'f4', 'f5', 'f7', 'f8'],
      },
    ],
  },
};

/** The model name of a recording this script wrote, which tells it from one `pnpm agent:record` made live. */
export const HAND_WRITTEN = 'hand-written';

const isHandWritten = (file: string): boolean => {
  try {
    return recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8'))).model === HAND_WRITTEN;
  } catch {
    return false;
  }
};

/**
 * Rewrites each locale's recording under the hash of the prompt the worker sends today, removes the hand-written ones
 * it replaces and leaves every other file in the folder alone, and moves each failure case recording of the same
 * prompt (`fixtures/agent-replay-cases`) to the new hash.
 */
export function rewriteWatchRecordings({ replay, cases }: { readonly replay: string; readonly cases: string }) {
  const dir = join(replay, 'portfolio_watch');
  const stale = new Set(readdirSync(dir).map((file) => join(dir, file)).filter(isHandWritten));
  const inputs: CanonicalInput[] = [];
  for (const [locale, { label, notes }] of Object.entries(NOTES) as Array<[Locale, (typeof NOTES)[Locale]]>) {
    const prepared = portfolioWatchRequest({ db: fakeDb({}), householdId: HOUSEHOLD, jobId: 'watch-recording', locale, asOf: isoDate('2026-10-07'), timezone: 'Asia/Ho_Chi_Minh', clock: clockOn('2026-10-07T06:40:00+07:00'), read: async () => ({ snapshot, labels }) });
    const input = canonicalInput({ spec: JOBS.portfolio_watch, prompt: prepared.prompt, canon: canonicalizer({ householdName: 'Gia đình Demo' }) });
    const toolCalls = [{ name: mcpToolName('watch_facts'), input: {} }, ...notes.map((note) => ({ name: mcpToolName('create_item'), input: { ...note, related: [...note.related] } }))];
    const written = writeRecording(replay, { version: 1, kind: 'portfolio_watch', inputHash: inputHash(input), input, label, model: HAND_WRITTEN, numTurns: toolCalls.length + 1, toolCalls, reply: 'xong' });
    stale.delete(written);
    inputs.push(input);
    console.log(written);
  }
  for (const file of stale) rmSync(file);

  for (const name of readdirSync(cases)) {
    const caseDir = join(cases, name, 'portfolio_watch');
    if (!existsSync(caseDir)) continue;
    for (const file of readdirSync(caseDir).map((entry) => join(caseDir, entry))) {
      const recording = recordingSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      const input = inputs.find((candidate) => candidate.prompt === recording.input.prompt);
      if (input === undefined) continue;
      const written = writeRecording(join(cases, name), { ...recording, inputHash: inputHash(input), input });
      if (written !== file) rmSync(file);
      console.log(written);
    }
  }
}

if (import.meta.main) rewriteWatchRecordings({ replay: DEFAULT_REPLAY_DIR, cases: CASES });

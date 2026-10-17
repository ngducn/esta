import { checkNumbers, collectAllowed } from '@esta/core/guard';
import type { IsoDate } from '@esta/core/date';
import { describe, expect, it } from 'vitest';
import { canonicalizer, inputHash, type CanonicalInput } from './canonicalize';

describe('canonicalizer', () => {
  it('maps the household name, ids, memo codes and timestamps to placeholders and back', () => {
    const canon = canonicalizer({ householdName: 'Gia đình Demo 4' });
    const text =
      'Gia đình Demo 4: hóa đơn 9F1C2B3A-1111-5222-8333-444455556666 ghi ESTA 7K2QX9MP, hạn 2026-10-07T09:00:00+07:00; ' +
      'lại 9f1c2b3a-1111-5222-8333-444455556666 và 0b5a6c7d-1111-5222-8333-444455556666.';
    const canonical = canon.canonical(text);
    expect(canonical).toBe(
      '<household>: hóa đơn <id:1> ghi ESTA <memo:1>, hạn <time:1>; lại <id:1> và <id:2>.',
    );
    expect(canon.restore(canonical)).toBe(text.replace('9F1C2B3A', '9f1c2b3a'));
  });

  it('gives the same canonical text for two households, so one recording replays for both', () => {
    const prompt = (name: string) => `Trả lời cho ${name}. Tên: ${name}.`;
    const four = canonicalizer({ householdName: 'Gia đình Demo 4' }).canonical(prompt('Gia đình Demo 4'));
    const seven = canonicalizer({ householdName: 'Gia đình Demo 7' }).canonical(prompt('Gia đình Demo 7'));
    expect(four).toBe(seven);
    expect(four).toBe('Trả lời cho <household>. Tên: <household>.');
  });

  it('restores a recorded reply into the current household', () => {
    const canon = canonicalizer({ householdName: 'Gia đình Demo 10' });
    expect(canon.restore('Kết nối tốt cho "<household>".')).toBe('Kết nối tốt cho "Gia đình Demo 10".');
  });
});

describe('a recorded reply under the number guard (AGENT.md §6.3 and §8)', () => {
  const recorded = '<household>: Phòng 5 quá hạn 12 ngày, còn nợ 3.500.000 ₫. [Xem](esta://invoice/<id:1>)';
  const run = (householdName: string, invoiceId: string) => {
    const canon = canonicalizer({ householdName });
    canon.canonical(`Hộ ${householdName}, hóa đơn ${invoiceId}`);
    const allowed = collectAllowed(
      [{ tool: 'watch_facts', result: { invoice_id: invoiceId, unit_label: 'Phòng 5', days_overdue: 12, outstanding: 3_500_000 } }],
      { today: '2026-10-07' as IsoDate, householdName },
    );
    return { reply: canon.restore(recorded), allowed };
  };

  it('passes in each household it replays for, with that household name and record id', () => {
    for (const [name, id] of [
      ['Gia đình Demo 3', '0b5a6c7d-1111-5222-8333-444455550003'],
      ['Gia đình Demo 7', '0b5a6c7d-1111-5222-8333-444455550007'],
    ] as const) {
      const { reply, allowed } = run(name, id);
      expect(reply).toBe(`${name}: Phòng 5 quá hạn 12 ngày, còn nợ 3.500.000 ₫. [Xem](esta://invoice/${id})`);
      expect(checkNumbers(reply, allowed).violations).toEqual([]);
    }
  });

  it('rejects another household name, whose number only that household context allows', () => {
    const three = run('Gia đình Demo 3', '0b5a6c7d-1111-5222-8333-444455550003');
    const seven = run('Gia đình Demo 7', '0b5a6c7d-1111-5222-8333-444455550007');
    expect(checkNumbers(three.reply, seven.allowed).violations.map((violation) => violation.text)).toEqual(['3']);
  });
});

describe('inputHash', () => {
  const input: CanonicalInput = { version: 1, kind: 'ping', prompt: 'p', builtInTools: [], mcpTools: ['household_info'], maxTurns: 3 };

  it('is 64 hex characters and ignores key order', () => {
    const reordered = { maxTurns: 3, mcpTools: ['household_info'], builtInTools: [], prompt: 'p', kind: 'ping', version: 1 } as const;
    expect(inputHash(input)).toMatch(/^[0-9a-f]{64}$/);
    expect(inputHash({ ...reordered, mcpTools: [...reordered.mcpTools], builtInTools: [] })).toBe(inputHash(input));
  });

  it('changes with the prompt', () => {
    expect(inputHash({ ...input, prompt: 'q' })).not.toBe(inputHash(input));
  });
});

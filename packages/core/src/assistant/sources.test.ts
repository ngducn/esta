import { describe, expect, it } from 'vitest';
import type { IsoDate } from '../date/iso-date';
import { checkSources, type SourceRef } from './sources';

const chip = (url: string): SourceRef => ({ kind: 'source', n: 1, url, source_name: 'Nguồn', published_on: '2026-10-01' as IsoDate });

describe('checkSources (AGENT.md §5.6 step 9)', () => {
  it('passes a procedure question with an official chip', () => {
    expect(checkSources('Thủ tục sang tên sổ đỏ cần những giấy tờ gì?', [chip('https://thuvienphapluat.vn/a')]).ok).toBe(true);
    expect(checkSources('Thủ tục sang tên sổ đỏ', [chip('https://so-tn.hanoi.gov.vn/a')]).ok).toBe(true);
  });

  it('fails one with only a press chip, or with no chip', () => {
    expect(checkSources('Thủ tục sang tên sổ đỏ cần những giấy tờ gì?', [chip('https://baochi.example/a')]).ok).toBe(false);
    expect(checkSources('Thủ tục sang tên sổ đỏ', ['esta://ledger/1']).ok).toBe(false);
    expect(checkSources('Thủ tục sang tên sổ đỏ', [chip('https://fakegov.vn/a'), chip('https://gov.vn.evil.example/a')]).ok).toBe(false);
  });

  it('does not read thuê as thuế', () => {
    expect(checkSources('Cho thuê theo năm có lợi không?', []).ok).toBe(true);
    expect(checkSources('Thuế cho thuê phải đóng bao nhiêu?', []).ok).toBe(false);
  });

  it('passes a question about her own tax citing tax_position with no page', () => {
    expect(checkSources('Năm nay mẹ đóng thuế bao nhiêu?', [], true).ok).toBe(true);
  });

  it('asks no source of a question that is not legal', () => {
    expect(checkSources('Tháng này thu được bao nhiêu từ Dĩ An?', []).ok).toBe(true);
  });
});

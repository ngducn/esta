import { describe, expect, it } from 'vitest';
import { meterReadingsSave } from './meter-ops';
import { runOp } from './op';
import { fakeDb, opContext as context, type Sent } from './test/fake-db';

const PROPERTY = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0020';
const ELECTRICITY = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0021';
const WATER = '0b6c1f9e-7d1a-4c55-9a3e-5b0c2d1e0022';
const input = {
  property_id: PROPERTY,
  reading_month: '2026-10-01',
  readings: [
    { meter_id: ELECTRICITY, reading: 2967 },
    { meter_id: WATER, reading: 318 },
  ],
};

const answers = (stored: readonly { meter_id: string; reading: number }[]) => (request: Sent) =>
  request.table === 'meter_readings' ? stored : request.table === 'rpc/save_meter_readings' ? [{ saved: 2, issued: 1 }] : [];

describe('meterReadingsSave (LSE-4)', () => {
  it('saves a month of readings through save_meter_readings and reports the bills it issued', async () => {
    const { db, sent } = fakeDb(answers([{ meter_id: ELECTRICITY, reading: 2967 }]));
    expect(await runOp(meterReadingsSave, context(db), input)).toEqual({ ok: true, value: { saved: 2, issued: 1 } });
    expect(sent.at(-1)).toMatchObject({
      table: 'rpc/save_meter_readings',
      body: { p_property_id: PROPERTY, p_reading_month: '2026-10-01', p_readings: input.readings },
    });
  });

  it('plans readings equal to the stored ones as unchanged, and writes nothing', async () => {
    const { db, sent } = fakeDb(answers(input.readings));
    expect(await runOp(meterReadingsSave, context(db), input)).toEqual({ ok: true, value: { saved: 0, issued: 0 } });
    expect(sent.map((request) => request.table)).toEqual(['meter_readings']);
  });

  it('refuses a month that does not start on the 1st, a fraction, a negative reading and a meter named twice before reading', async () => {
    for (const bad of [
      { ...input, reading_month: '2026-10-15' },
      { ...input, readings: [{ meter_id: ELECTRICITY, reading: 12.5 }] },
      { ...input, readings: [{ meter_id: ELECTRICITY, reading: -1 }] },
      { ...input, readings: [input.readings[0], input.readings[0]] },
      { ...input, readings: [] },
    ]) {
      const { db, sent } = fakeDb();
      expect(await runOp(meterReadingsSave, context(db), bad)).toMatchObject({ ok: false, reason: { kind: 'invalid' } });
      expect(sent).toEqual([]);
    }
  });

  it('names a reading below the month before, and a month used past what a bill line holds, as the database refuses them', async () => {
    for (const [message, kind] of [
      ['ESTA_READING_BELOW_PREVIOUS', 'below_previous'],
      ['ESTA_READING_USE_TOO_LARGE', 'use_too_large'],
    ] as const) {
      const { db } = fakeDb(answers([]), (request) => (request.table.startsWith('rpc/') ? { code: '23514', message } : null));
      expect(await runOp(meterReadingsSave, context(db), input)).toEqual({ ok: false, reason: { kind } });
    }
  });
});

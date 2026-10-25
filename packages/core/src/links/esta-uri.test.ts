import { describe, expect, it } from 'vitest';
import { ESTA_LINK_TABLES, estaUri, parseEstaUri, type EstaLinkType } from './esta-uri';

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

describe('parseEstaUri', () => {
  it.each(Object.keys(ESTA_LINK_TABLES) as EstaLinkType[])('reads an esta://%s link into its typed route and back', (type) => {
    const parsed = parseEstaUri(`esta://${type}/${ID}`);
    expect(parsed).toEqual({ ok: true, value: { type, id: ID } });
    if (parsed.ok) expect(estaUri(parsed.value)).toBe(`esta://${type}/${ID}`);
  });

  it('refuses a type no record has', () => {
    expect(parseEstaUri(`esta://tenant/${ID}`)).toEqual({ ok: false, reason: 'unknown_type' });
    expect(parseEstaUri(`esta://constructor/${ID}`)).toEqual({ ok: false, reason: 'unknown_type' });
  });

  it.each(['not-a-uuid', `${ID}x`, ID.toUpperCase(), `${ID}/finance`, `${ID}\n`, ''])('refuses the id %j', (id) => {
    expect(parseEstaUri(`esta://invoice/${id}`).ok).toBe(false);
  });

  it.each([`https://esta.app/invoice/${ID}`, `esta:invoice/${ID}`, `ESTA://invoice/${ID}`, ` esta://invoice/${ID}`])('refuses %j', (uri) => {
    expect(parseEstaUri(uri)).toEqual({ ok: false, reason: 'malformed' });
  });
});

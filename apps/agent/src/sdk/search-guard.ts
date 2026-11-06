const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/giu, 'd').toLowerCase();

const YEAR = /(?<!\d)(?:19|20)\d{2}(?!\d)/gu;

/** Why a WebSearch query may not leave the house, or null: family data stays out of search words [app rule] (AGENT.md §6.4). */
export function searchDenial(query: string, family: readonly string[]): string | null {
  if (/\d/u.test(query.replace(YEAR, ' '))) return 'a search holds no number except a four-digit year, so no phone, amount or room number leaves Esta';
  const words = ` ${fold(query).replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  const held = family.find((term) => {
    const name = fold(term).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return name !== '' && words.includes(` ${name} `);
  });
  return held === undefined ? null : 'a search holds no name, nickname or street of the family\'s records; search the topic in general words, with a province or commune at most';
}

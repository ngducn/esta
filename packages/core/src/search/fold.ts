export function foldVietnamese(text: string): string {
  return text
    .toLowerCase()
    .replace(/[đð]/g, 'd')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** True when every word of the query appears in the text, ignoring case and diacritics. */
export function matchesSearch(query: string, text: string): boolean {
  const haystack = foldVietnamese(text);
  return foldVietnamese(query)
    .split(/\s+/)
    .filter((word) => word !== '')
    .every((word) => haystack.includes(word));
}

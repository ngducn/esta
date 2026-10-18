export type IsoDate = string & { readonly __brand: 'IsoDate' };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isIsoDate(text: string): text is IsoDate {
  const match = ISO_DATE.exec(text);
  if (match === null) return false;
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function isoDate(text: string): IsoDate {
  if (!isIsoDate(text)) throw new Error(`Not an ISO date (YYYY-MM-DD): "${text}"`);
  return text;
}

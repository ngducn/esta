import { normalizeName } from '../names';

/** The values a certificate save writes, by review path: a plan's `acceptedFields`, or what the review has decided so far. */
export type Saved = Readonly<Record<string, { readonly value: string | number | boolean }>>;

const PARCEL_ADDRESS = /^parcels\[\d+\]\.address_text$/u;
const HOLDER_NAME = /^holders\[(\d+)\]\.full_name$/u;

/** The address a certificate save writes as the property's certificate address: the first parcel address decided. */
export function savedAddress(saved: Saved): { readonly path: string; readonly value: string } | null {
  for (const [path, { value }] of Object.entries(saved)) if (PARCEL_ADDRESS.test(path) && typeof value === 'string') return { path, value };
  return null;
}

export type Replaced = { readonly path: string; readonly before: string; readonly after: string };

/** #356: the one value a certificate save writes over, the property's certificate address, when it holds another one. */
export function replacedAddress(saved: Saved, before: string | null): Replaced | null {
  const after = savedAddress(saved);
  if (after === null || before === null || before.trim() === '' || normalizeName(before) === normalizeName(after.value)) return null;
  return { path: after.path, before, after: after.value };
}

type Person = { readonly fullName: string; readonly idLast4: string | null };

/** What the property already says that a certificate is judged against: its current province and its owners. */
export type PropertyFacts = { readonly provinceCode: string | null; readonly owners: readonly Person[] };

export type MismatchKind = 'province' | 'holders';
export type Mismatch = { readonly kind: MismatchKind; readonly paths: readonly string[] };

type Judged = { readonly saved: Saved; readonly property: PropertyFacts; readonly addressProvince: string | null };

function savedHolders(saved: Saved): (Person & { readonly path: string })[] {
  return Object.entries(saved).flatMap(([path, { value }]) => {
    const index = HOLDER_NAME.exec(path)?.[1];
    if (index === undefined || typeof value !== 'string') return [];
    const idLast4 = saved[`holders[${index}].id_last4`]?.value;
    return [{ path, fullName: value, idLast4: typeof idLast4 === 'string' ? idLast4 : null }];
  });
}

const samePerson = (a: Person, b: Person) => normalizeName(a.fullName) === normalizeName(b.fullName) && (a.idLast4 === null || b.idLast4 === null || a.idLast4 === b.idLast4);

/**
 * [app rule] #356: the signs that a certificate is another property's, each naming the review rows that disagree. A
 * rule with nothing to compare, such as a new property with no address or owners yet, finds nothing.
 */
const MISMATCHES: readonly { readonly kind: MismatchKind; readonly paths: (judged: Judged) => readonly string[] }[] = [
  {
    kind: 'province',
    paths: ({ saved, property, addressProvince }) => {
      const address = savedAddress(saved);
      return address !== null && addressProvince !== null && property.provinceCode !== null && addressProvince !== property.provinceCode ? [address.path] : [];
    },
  },
  {
    kind: 'holders',
    paths: ({ saved, property }) => {
      const holders = savedHolders(saved);
      if (holders.length === 0 || property.owners.length === 0) return [];
      return holders.some((holder) => property.owners.some((owner) => samePerson(holder, owner))) ? [] : holders.map((holder) => holder.path);
    },
  },
];

/** The mismatches a save stops on until Mẹ confirms; `addressProvince` is the province the saved address lies in today. */
export function certificateMismatches(saved: Saved, property: PropertyFacts, addressProvince: string | null): Mismatch[] {
  return MISMATCHES.flatMap(({ kind, paths }) => {
    const found = paths({ saved, property, addressProvince });
    return found.length === 0 ? [] : [{ kind, paths: found }];
  });
}

export function soleProvince(codes: readonly string[]): string | null {
  const [first] = codes;
  return first !== undefined && codes.every((code) => code === first) ? first : null;
}

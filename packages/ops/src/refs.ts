import type { Result } from '@esta/core/result';
import { z } from 'zod';
import type { CommonRefusal } from './kit';

export const refLabelSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/);

export type Label = { readonly index: number; readonly id: string };
export type RefRefusal = { readonly kind: 'unknown_ref'; readonly ref: string } | CommonRefusal;
export type Blocked = { readonly kind: 'blocked'; readonly by: readonly number[] };
export type Resolved = { readonly input: unknown; readonly needs: readonly number[] };

const refOf = (value: object): unknown => (Object.keys(value).length === 1 && Object.hasOwn(value, '$ref') ? Reflect.get(value, '$ref') : undefined);
const holdsId = (key: string) => key === 'id' || key.endsWith('_id');
const holdsIds = (key: string) => key.endsWith('_ids');

/** Puts each earlier item's minted id where a `$ref` stands under an `id`, a `*_id` key or in a `*_ids` list. */
export function resolveRefs(input: unknown, labels: ReadonlyMap<string, Label>): Result<Resolved, RefRefusal> {
  const needs = new Set<number>();
  const refusals: RefRefusal[] = [];
  const walk = (value: unknown, path: readonly (string | number)[], idSlot: boolean): unknown => {
    const key = String(path.at(-1) ?? '');
    if (Array.isArray(value)) return value.map((inner, index) => walk(inner, [...path, index], holdsIds(key)));
    if (typeof value !== 'object' || value === null) return value;
    const ref = refOf(value);
    if (ref === undefined) return Object.fromEntries(Object.entries(value).map(([inner, field]) => [inner, walk(field, [...path, inner], holdsId(inner))]));
    const label = typeof ref === 'string' ? labels.get(ref) : undefined;
    if (idSlot && label !== undefined) {
      needs.add(label.index);
      return label.id;
    }
    refusals.push(idSlot ? { kind: 'unknown_ref', ref: String(ref) } : { kind: 'invalid', issues: [{ path: path.join('.'), code: 'ref_not_an_id' }] });
    return value;
  };
  const resolved = walk(input, [], false);
  const [refusal] = refusals;
  if (refusal !== undefined) return { ok: false, reason: refusal };
  return { ok: true, value: { input: resolved, needs: [...needs].toSorted((a, b) => a - b) } };
}

export function addLabel(labels: Map<string, Label>, ref: string | undefined, at: { readonly index: number; readonly id: string | null }): CommonRefusal | null {
  if (ref === undefined) return null;
  if (at.id === null) return { kind: 'invalid', issues: [{ path: 'ref', code: 'not_a_create' }] };
  if (labels.has(ref)) return { kind: 'invalid', issues: [{ path: 'ref', code: 'duplicate' }] };
  labels.set(ref, { index: at.index, id: at.id });
  return null;
}

export function blockedBy(needs: readonly number[], earlier: readonly { readonly status: string }[]): Blocked | null {
  const by = needs.filter((index) => earlier[index]?.status === 'refused');
  return by.length === 0 ? null : { kind: 'blocked', by };
}

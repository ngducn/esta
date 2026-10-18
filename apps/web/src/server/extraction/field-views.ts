import 'server-only';
import { needsCheck } from '@esta/core/extraction/confidence';
import { INPUT_KINDS, type InputKind, type ReviewField } from '@esta/core/extraction/fields';
import { isIsoDate } from '@esta/core/date';
import { formatArea, formatDate, formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { getLocale, getTranslations } from 'next-intl/server';

/**
 * One review row as the browser needs it, read and formatted on the server so the page ships no schema code: the
 * label, what the assistant read as Mẹ would write it, and whether it is marked `kiểm tra lại`.
 */
export type FieldView = {
  readonly path: string;
  readonly label: string;
  readonly input: InputKind;
  readonly page: number | null;
  readonly marked: boolean;
  /** The value read, formatted; null when nothing was read. */
  readonly display: string | null;
  /** False when the value read does not fit its kind, so it must be edited before it is accepted. */
  readonly readable: boolean;
  /** The value read as the editor takes it: an ISO date for a date, an option value for a choice, else the text. */
  readonly editValue: string;
  readonly options: readonly { readonly value: string; readonly label: string }[] | null;
  /** The area read, for the parcel's area-sum check. */
  readonly area: number | null;
  readonly section: { readonly key: string; readonly list: string; readonly number: number };
};

const CHOICES = new Set<InputKind>(['form', 'use_form', 'annotation_kind', 'utility_kind']);

export async function fieldViews(fields: readonly ReviewField[], rootList: 'certificate' | 'bill'): Promise<FieldView[]> {
  const [t, locale] = await Promise.all([getTranslations('extraction'), getLocale()]);
  const lang = locale === 'en' ? 'en' : 'vi';
  const format = (kind: InputKind, value: unknown): string => {
    if ((kind === 'area' || kind === 'number') && typeof value === 'number') return formatArea(value, lang);
    if (kind === 'money' && typeof value === 'number') return formatVnd(vnd(value), lang);
    if ((kind === 'date' || kind === 'term') && typeof value === 'string' && isIsoDate(value)) return formatDate(value, lang);
    if (CHOICES.has(kind) || kind === 'term') return t('option', { kind, value: String(value) });
    return String(value);
  };
  const editable = (kind: InputKind, value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (kind === 'area' || kind === 'number') return format(kind, value).replace(/\s*m²$/u, '');
    if (kind === 'term' && typeof value === 'string' && isIsoDate(value)) return formatDate(value, lang);
    return String(value);
  };
  return fields.map((field) => {
    const { input } = field.descriptor;
    const raw = field.leaf?.value ?? null;
    const parsed = INPUT_KINDS[input].parse(raw);
    const value = parsed.ok ? parsed.value : null;
    const options = INPUT_KINDS[input].options;
    return {
      path: field.path,
      label: t(`fields.${field.descriptor.label}` as 'fields.form'),
      input,
      page: field.leaf?.page ?? null,
      marked: needsCheck(field),
      display: value !== null ? format(input, value) : parsed.ok ? null : String(raw),
      readable: parsed.ok,
      editValue: parsed.ok ? editable(input, value) : String(raw ?? ''),
      options: options === null ? null : options.map((option) => ({ value: option, label: t('option', { kind: input, value: option }) })),
      area: typeof value === 'number' && input === 'area' ? value : null,
      section: { key: field.section.key, list: field.section.list ?? rootList, number: field.section.numbers.at(-1) ?? 0 },
    };
  });
}

export type TlvFault =
  | { kind: 'malformed'; offset: number }
  | { kind: 'length'; tag: string; declared: number; remaining: number }
  | { kind: 'duplicate'; tag: string };

export type Tlv = ReadonlyMap<string, string>;

export type TlvResult = { ok: true; value: Tlv } | { ok: false; fault: TlvFault };

const TWO_DIGITS = /^\d{2}$/;

export function tlv(tag: string, value: string): string {
  if (value.length < 1 || value.length > 99) {
    throw new RangeError(`tag ${tag}: value length ${value.length} outside 1..99`);
  }
  return tag + String(value.length).padStart(2, '0') + value;
}

export function parseTlv(text: string): TlvResult {
  const fields = new Map<string, string>();
  let offset = 0;
  while (offset < text.length) {
    const tag = text.slice(offset, offset + 2);
    const lengthText = text.slice(offset + 2, offset + 4);
    if (!TWO_DIGITS.test(tag) || !TWO_DIGITS.test(lengthText)) return { ok: false, fault: { kind: 'malformed', offset } };
    const declared = Number(lengthText);
    const value = text.slice(offset + 4, offset + 4 + declared);
    if (declared === 0 || value.length !== declared) {
      return { ok: false, fault: { kind: 'length', tag, declared, remaining: value.length } };
    }
    if (fields.has(tag)) return { ok: false, fault: { kind: 'duplicate', tag } };
    fields.set(tag, value);
    offset += 4 + declared;
  }
  return { ok: true, value: fields };
}

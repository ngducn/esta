function step(crc: number, byte: number): number {
  crc ^= byte << 8;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function utf8Bytes(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return bytes;
}

// CRC-16/CCITT-FALSE: ISO/IEC 13239, polynomial 0x1021, initial 0xFFFF, no reflection, no final xor,
// over the UTF-8 bytes of the text. Check value for "123456789" is 0x29B1.
export function crc16CcittFalse(text: string): number {
  return utf8Bytes(text).reduce(step, 0xffff);
}

export function crcHex(text: string): string {
  return crc16CcittFalse(text).toString(16).toUpperCase().padStart(4, '0');
}

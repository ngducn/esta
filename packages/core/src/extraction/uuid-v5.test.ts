import { describe, expect, it } from 'vitest';
import { uuidV5 } from './uuid-v5';

describe('uuidV5', () => {
  it.each([
    ['', '1b4db7eb-4057-5ddf-91e0-36dec72071f5'],
    ['seed:household:demo', '0943e55d-b0a6-5aef-839d-07c8693c520e'],
    ['extraction:00000000-0000-4000-8000-0000000000e1:parcels[0]', '62c04b75-24b3-5d0c-9189-a635ad8501d1'],
    ['Nguyễn Thị Demo '.repeat(5), 'eb0167b0-f57b-5200-9a9e-e2df5dfbdd47'],
  ])('names %j as node:crypto and the seed ids do', (name, expected) => {
    expect(uuidV5(name)).toBe(expected);
  });
});

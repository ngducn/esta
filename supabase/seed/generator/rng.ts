export type Rng = {
  next(): number;
  intInclusive(min: number, max: number): number;
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, intInclusive: (min, max) => min + Math.floor(next() * (max - min + 1)) };
}

function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(text, 'utf8')) hash = Math.imul(hash ^ byte, 0x01000193);
  return hash >>> 0;
}

export function rngFor(scope: string): Rng {
  return createRng(fnv1a32(scope));
}

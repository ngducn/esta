export type Rng = {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
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
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)) };
}

/** A stream seeded from a string (FNV-1a), so each scope draws its own fixed sequence. */
export function rngFor(scope: string): Rng {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(scope, 'utf8')) hash = Math.imul(hash ^ byte, 0x01000193);
  return createRng(hash);
}

/**
 * Deterministic PRNGs used for watermark embedding/extraction.
 * All functions are pure and produce the same sequence for a given seed across
 * Node.js versions, so watermarked images can always be decoded later.
 *
 * We use mulberry32 because it is fast, has a long enough period, and is
 * implementable in a few lines. The seed space is 32 bits; the secret is
 * hashed into the seed.
 */

/**
 * Very simple but fast string hash into a 32-bit unsigned integer.
 * Not cryptographic; only used to derive deterministic PRNG seeds.
 */
export function hashStringToSeed(input: string): number {
  let h = 1779033703 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 597399067) >>> 0;
    h = Math.imul(h ^ (h >>> 18), 2869860233) >>> 0;
  }
  return h;
}

export type Prng = () => number;

/**
 * Create a mulberry32 PRNG. Each call returns a float in [0, 1).
 */
export function mulberry32(seed: number): Prng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Create a deterministic 0/1 keystream generator used to lightly encrypt the
 * payload before embedding.
 */
export function createKeyStream(
  secret: string,
  mapId: string,
  userId: string,
  datestamp: string
): () => 0 | 1 {
  const seed = hashStringToSeed(
    `${secret}:${mapId}:${userId}:${datestamp}:keystream`
  );
  const rng = mulberry32(seed);
  return () => (rng() < 0.5 ? 0 : 1);
}

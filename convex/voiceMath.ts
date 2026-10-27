// Speaker-verification math shared by the server (enrollment) and the app
// (calibrating older enrollments, the "Test my voice" screen). Pure
// functions — no Convex imports — so the client can import them too.
//
// Each utterance yields an x-vector from Vosk's speaker model: a fixed-size
// numeric "voiceprint" summarizing the speaker's vocal characteristics
// (pitch range, timbre, resonance of their vocal tract, speaking style) —
// largely independent of the words said. Two utterances from the same
// person point in a similar direction, so we compare them by cosine
// similarity (1 = identical direction, ~0 = unrelated).

// Minimum voiced frames (10 ms each) for a trustworthy voiceprint.
export const MIN_SPEAKER_FRAMES = 50;

// During training, a new recording must at least this similar to the
// earlier ones, or it's probably someone else / TV / noise.
export const MIN_ENROLLMENT_CONSISTENCY = 0.45;

// Per-owner threshold is clamped to this range.
export const THRESHOLD_FLOOR = 0.55;
export const THRESHOLD_CEILING = 0.8;
// How far below the owner's weakest training sample the bar sits.
export const THRESHOLD_MARGIN = 0.08;
// Used only if an enrollment can't be calibrated.
export const DEFAULT_THRESHOLD = 0.6;

export function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// Average of unit-length vectors, so one loud/long sample can't dominate.
export function centroid(vectors: number[][]): number[] {
  const units = vectors.map(normalize);
  const dim = units[0].length;
  const sum = new Array(dim).fill(0);
  for (const u of units) for (let i = 0; i < dim; i++) sum[i] += u[i];
  return normalize(sum.map((s) => s / units.length));
}

// The owner's own bar. Each training sample is scored against the voiceprint
// built from the OTHER samples (leave-one-out) — scoring it against an
// average that includes itself would flatter it and set the bar too high,
// rejecting the owner. The bar sits a margin below the weakest such score,
// so a consistent speaker gets a stricter bar than a variable one.
export function calibrateThreshold(samples: number[][]): number {
  if (samples.length < 3) return DEFAULT_THRESHOLD;
  const looScores = samples.map((s, i) => cosine(s, centroid(samples.filter((_, j) => j !== i))));
  const t = Math.min(...looScores) - THRESHOLD_MARGIN;
  return Math.round(Math.min(THRESHOLD_CEILING, Math.max(THRESHOLD_FLOOR, t)) * 1000) / 1000;
}

// True when the training recordings were too inconsistent to make a
// trustworthy voiceprint (noisy room, mumbling, different people). The app
// suggests training again; verification still uses the floor threshold.
export function isWeakTraining(samples: number[][]): boolean {
  if (samples.length < 3) return true;
  const looScores = samples.map((s, i) => cosine(s, centroid(samples.filter((_, j) => j !== i))));
  return Math.min(...looScores) < THRESHOLD_FLOOR;
}

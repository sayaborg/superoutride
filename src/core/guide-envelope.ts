import { profileIndexAt } from './open-profile.js';
import { GEOMETRY_SAMPLING_TOLERANCE_METERS } from './tolerances.js';

export type GuideEnvelope = readonly { readonly s: number; readonly lMax: number }[];

/** A number authors a constant profile; both forms publish the same owned linear reader data. */
export function compileGuideEnvelope(input: number | GuideEnvelope, length: number): GuideEnvelope {
  if (!(length > 0) || !Number.isFinite(length))
    throw new RangeError('Guide envelope length must be finite and positive');
  const nodes =
    typeof input === 'number'
      ? [
          { s: 0, lMax: input },
          { s: length, lMax: input },
        ]
      : input;
  if (!Array.isArray(nodes)) throw new TypeError('Guide envelope must be a number or an array of knots');
  if (nodes.length < 2) throw new RangeError('Guide envelope requires at least two knots');
  const copied = nodes.map((node, i) => {
    if (!node || typeof node.s !== 'number' || typeof node.lMax !== 'number')
      throw new TypeError('Guide envelope knot requires numeric s and lMax');
    if (!Number.isFinite(node.s) || !Number.isFinite(node.lMax) || !(node.lMax > 0))
      throw new RangeError('Guide envelope knots must be finite with positive lMax');
    if (node.s < 0 || node.s > length || (i > 0 && node.s <= nodes[i - 1]!.s))
      throw new RangeError('Guide envelope knots must be strictly increasing within [0, length]');
    return Object.freeze({ s: node.s, lMax: node.lMax });
  });
  if (copied[0]!.s !== 0 || copied.at(-1)!.s !== length)
    throw new RangeError('Guide envelope must cover exactly [0, length]');
  return Object.freeze(copied);
}

export function guideEnvelopeAt(envelope: GuideEnvelope, s: number): number {
  const length = envelope.at(-1)!.s;
  if (!Number.isFinite(s) || s < -GEOMETRY_SAMPLING_TOLERANCE_METERS || s > length + GEOMETRY_SAMPLING_TOLERANCE_METERS)
    throw new RangeError(`Guide envelope chainage must be within [0, ${length}]`);
  const checked = Math.max(0, Math.min(length, s));
  const i = Math.min(profileIndexAt(envelope, 's', checked), envelope.length - 2);
  const a = envelope[i]!,
    b = envelope[i + 1]!;
  if (checked === a.s) return a.lMax;
  if (checked === b.s) return b.lMax;
  return a.lMax + (b.lMax - a.lMax) * ((checked - a.s) / (b.s - a.s));
}

/** Exact extrema of the piecewise-linear profile, including both clipped interval endpoints. */
export function guideEnvelopeRange(
  envelope: GuideEnvelope,
  start = 0,
  end = envelope.at(-1)!.s,
): { min: number; max: number } {
  if (end < start) throw new RangeError('Guide envelope interval must be ordered');
  const a = guideEnvelopeAt(envelope, start),
    b = guideEnvelopeAt(envelope, end);
  let min = Math.min(a, b),
    max = Math.max(a, b);
  for (const node of envelope) {
    if (node.s <= start) continue;
    if (node.s >= end) break;
    min = Math.min(min, node.lMax);
    max = Math.max(max, node.lMax);
  }
  return { min, max };
}

/** Admission for constant-only authoring operations; never approximate a varying profile by its maximum. */
export function constantGuideEnvelopeWidth(envelope: GuideEnvelope): number {
  const { min, max } = guideEnvelopeRange(envelope);
  if (min !== max)
    throw new RangeError(
      'This authoring operation requires a constant Guide envelope; varying profiles are unsupported',
    );
  return min;
}

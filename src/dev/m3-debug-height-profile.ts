import { HeightProfile } from '../visual/height-profile.js';

/** Historical M3 DEV elevation fixture. Product height authority remains HeightProfile authoring. */
export function createM3DebugHeightProfile(courseLength: number): HeightProfile {
  const interior = [
    { s: 0, y: 0 },
    { s: 60, y: 0 },
    { s: 125, y: 8 },
    { s: 180, y: 8 },
    { s: 250, y: 0 },
    { s: 320, y: 0 },
    { s: 385, y: -5 },
    { s: 450, y: 0 },
    { s: 560, y: 0 },
    { s: 700, y: 0 },
  ].filter((node, index, array) => node.s < courseLength && (index === 0 || node.s > array[index - 1]!.s));
  return new HeightProfile(courseLength, [...interior, { s: courseLength, y: interior.at(-1)?.y ?? 0 }]);
}

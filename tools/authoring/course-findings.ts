import {
  joinCandidates,
  mergeCandidates,
  offStepValues,
  ROUNDED_VALUES,
  unneededKnotCandidates,
} from './course-cleaning.js';
import { childPointer, type Json } from './json-pointer.js';

/** The kinds of finding, each with the cleaning operation that answers it (none for unused declarations). */
export const FINDING_KINDS = {
  digits: 'round',
  'unneeded-knot': 'remove-knots',
  near: 'join',
  referable: 'join',
  repeatable: 'merge',
  'near-color': 'merge',
  'equal-width': 'merge',
  unused: null,
  'zero-median': null,
} as const;
export type FindingKind = keyof typeof FINDING_KINDS;

/** A finding: something in the course data worth tidying, where it is, and the operation that tidies it. */
export interface CourseFinding {
  readonly kind: FindingKind;
  readonly pointer: string;
  readonly description: string;
  readonly operation: (typeof FINDING_KINDS)[FindingKind];
}

/** The step a value is meaningful to, the distance things count as near and the colour steps colours do. */
export interface FindingOptions {
  readonly step: number;
  readonly tolerance: number;
  readonly colorTolerance: number;
}

/** Every string written in a value, with its Pointer. */
function stringsOf(value: Json | undefined, pointer = '', found: { pointer: string; text: string }[] = []) {
  if (typeof value === 'string') found.push({ pointer, text: value });
  else if (Array.isArray(value)) value.forEach((item, i) => stringsOf(item, childPointer(pointer, i), found));
  else if (value !== null && typeof value === 'object')
    for (const [key, item] of Object.entries(value)) stringsOf(item, childPointer(pointer, key), found);
  return found;
}

/** Declarations nothing names: Boundaries no other value of their Section names. */
function unusedDeclarations(document: Json): CourseFinding[] {
  const record = (value: Json | undefined) =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const findings: CourseFinding[] = [];
  const sections = record(document).sections;
  (Array.isArray(sections) ? sections : []).forEach((section, i) => {
    const boundaries = record(section).boundaries;
    const names = stringsOf(section, `/sections/${i}`);
    (Array.isArray(boundaries) ? boundaries : []).forEach((boundary, b) => {
      const pointer = `/sections/${i}/boundaries/${b}`;
      const id = record(boundary).id;
      if (typeof id === 'string' && !names.some((n) => n.text === id && n.pointer !== `${pointer}/id`))
        findings.push({ kind: 'unused', pointer, description: `Boundary ${id} is not used`, operation: null });
    });
    // A median whose width is zero throughout separates nothing.
    const lanes = record(section).lanes;
    (Array.isArray(lanes) ? lanes : []).forEach((element, l) => {
      const v = record(element);
      const width = v.width;
      const zero = width === 0 || (Array.isArray(width) && width.every((knot) => record(knot).width === 0));
      if (v.kind === 'median' && zero)
        findings.push({
          kind: 'zero-median',
          pointer: `/sections/${i}/lanes/${l}`,
          description: `The median at /sections/${i}/lanes/${l} is zero wide throughout`,
          operation: null,
        });
    });
  });
  return findings;
}

/**
 * What in a course document is worth tidying, without changing it: values off the step (meaningless digits), knots
 * nothing needs, near things that could be one, absolute laterals a reference could write, runs that could be a
 * repeat, near colours and declarations nothing uses. Each finding has its kind, Pointer, description and the cleaning
 * operation that answers it; the step and tolerances are arguments. The build does not read findings.
 */
export function courseFindings(document: Json, options: FindingOptions): CourseFinding[] {
  const findings: CourseFinding[] = [];
  const add = (kind: FindingKind, pointer: string, description: string) =>
    findings.push({ kind, pointer, description, operation: FINDING_KINDS[kind] });
  for (const value of offStepValues(document, { step: options.step, values: ROUNDED_VALUES }))
    add('digits', value.pointer, value.description);
  for (const knot of unneededKnotCandidates(document, { tolerance: 0 }))
    add('unneeded-knot', knot.pointer, knot.description);
  for (const join of joinCandidates(document, { tolerance: options.tolerance }))
    add(join.operation === 'join-reference' ? 'referable' : 'near', join.pointer, join.description);
  for (const merge of mergeCandidates(document, { colorTolerance: options.colorTolerance }))
    add(
      merge.operation === 'combine' ? 'repeatable' : merge.operation === 'merge-width' ? 'equal-width' : 'near-color',
      merge.pointer,
      merge.description,
    );
  findings.push(...unusedDeclarations(document));
  return findings;
}

/** How many findings of each kind, every kind listed. */
export function countFindings(findings: readonly CourseFinding[]): Record<FindingKind, number> {
  const counts = Object.fromEntries(Object.keys(FINDING_KINDS).map((kind) => [kind, 0])) as Record<FindingKind, number>;
  for (const finding of findings) counts[finding.kind]++;
  return counts;
}

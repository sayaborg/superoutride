import type { BandElementDocument } from '../course/course-document.js';
import { CourseInputError } from '../course/course-diagnostics.js';
import { compileBandGround, type BandPiece } from '../visual/band-ground.js';

/** A small authored 5 by 7 block alphabet; rows expand to runs of Bands. */
const GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '11111/00100/00100/00100/00100/00100/11111',
  J: '00111/00010/00010/00010/10010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/11001/10101/10011/10011/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/10101/01010',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  '0': '01110/10001/10011/10101/11001/10001/01110',
  '1': '00100/01100/00100/00100/00100/00100/01110',
  '2': '01110/10001/00001/00010/00100/01000/11111',
  '3': '11110/00001/00001/01110/00001/00001/11110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/10000/11110/00001/00001/11110',
  '6': '01110/10000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00001/01110',
});
const EXPANSION_LIMIT = 65536;

/** Expand saved constructs in list order; output is a disposable compiler product. */
export function expandCourseBands(
  elements: readonly BandElementDocument[],
  length: number,
  path: string,
): readonly BandPiece[] {
  const pieces: BandPiece[] = [];
  let work = 0;
  const add = (piece: BandPiece) => {
    if (pieces.length >= EXPANSION_LIMIT)
      throw new CourseInputError('resource_limit', path, 'Expanded Band pieces exceed 65536');
    if (piece.start < 0 || piece.end > length)
      throw new CourseInputError('invalid_profile', path, 'Expanded Band extends outside its Section');
    pieces.push(Object.freeze(piece));
  };
  const rectangle = (start: number, end: number, left: number, right: number, color: number) =>
    add({ start, end, left, right, leftEnd: left, rightEnd: right, color });
  const expand = (element: BandElementDocument, offset: number, at: string) => {
    if (++work > EXPANSION_LIMIT)
      throw new CourseInputError('resource_limit', at, 'Band expansion work exceeds 65536 constructs');
    switch (element.kind) {
      case 'band':
        if (element.knots.length < 2)
          throw new CourseInputError('invalid_profile', at, 'A Band requires at least two knots');
        for (let i = 0; i + 1 < element.knots.length; i++) {
          const a = element.knots[i]!,
            b = element.knots[i + 1]!;
          add({
            start: a.s + offset,
            end: b.s + offset,
            left: a.left,
            right: a.right,
            leftEnd: b.left,
            rightEnd: b.right,
            color: element.color,
          });
        }
        break;
      case 'repeat':
        for (let i = 0; i < element.count; i++)
          for (const [j, child] of element.elements.entries())
            expand(child, offset + i * element.every, `${at}/elements/${j}`);
        break;
      case 'curb': {
        if (!(element.end > element.start && element.right > element.left))
          throw new CourseInputError('invalid_profile', at, 'Curb extents must be positive');
        const count = Math.ceil((element.end - element.start) / element.stripe);
        if (count > EXPANSION_LIMIT)
          throw new CourseInputError('resource_limit', at, 'Curb expansion exceeds 65536 stripes');
        for (let i = 0; i < count; i++)
          rectangle(
            offset + element.start + i * element.stripe,
            offset + Math.min(element.end, element.start + (i + 1) * element.stripe),
            element.left,
            element.right,
            element.colors[i % 2]!,
          );
        break;
      }
      case 'text': {
        const cell = element.height / 7;
        for (let char = 0; char < element.text.length; char++) {
          if (element.text[char] === ' ') continue;
          const rows = GLYPHS[element.text[char]!]!.split('/');
          rows.forEach((row, y) => {
            for (let x = 0; x < 5; x++)
              if (row[x] === '1') {
                const start = x;
                while (x + 1 < 5 && row[x + 1] === '1') x++;
                rectangle(
                  offset + element.s + (6 - y) * cell,
                  offset + element.s + (7 - y) * cell,
                  element.l + (char * 6 + start) * cell,
                  element.l + (char * 6 + x + 1) * cell,
                  element.color,
                );
              }
          });
        }
        break;
      }
      case 'arrow': {
        const vertices = [
          [-0.18, 0],
          [0.18, 0],
          [0.18, 0.55],
          [0.5, 0.55],
          [0, 1],
          [-0.5, 0.55],
          [-0.18, 0.55],
        ].map(([x, y]) => {
          const l = element.direction === 'forward' ? x! : element.direction === 'right' ? y! - 0.5 : 0.5 - y!;
          const s = element.direction === 'forward' ? y! : 0.5 + x!;
          return { l: element.l + l * element.width, s: offset + element.s + s * element.length };
        });
        const stations = [...new Set(vertices.map((p) => p.s))].sort((a, b) => a - b);
        for (let i = 0; i + 1 < stations.length; i++) {
          const start = stations[i]!,
            end = stations[i + 1]!,
            middle = start + (end - start) / 2;
          const edges = vertices
            .map((a, j) => ({ a, b: vertices[(j + 1) % vertices.length]! }))
            .filter(({ a, b }) => middle > Math.min(a.s, b.s) && middle < Math.max(a.s, b.s));
          const atS = (edge: (typeof edges)[number], s: number) =>
            edge.a.l + ((edge.b.l - edge.a.l) * (s - edge.a.s)) / (edge.b.s - edge.a.s);
          edges.sort((a, b) => atS(a, middle) - atS(b, middle));
          for (let j = 0; j + 1 < edges.length; j += 2)
            add({
              start,
              end,
              left: atS(edges[j]!, start),
              right: atS(edges[j + 1]!, start),
              leftEnd: atS(edges[j]!, end),
              rightEnd: atS(edges[j + 1]!, end),
              color: element.color,
            });
        }
        break;
      }
    }
  };
  elements.forEach((element, i) => expand(element, 0, `${path}/${i}`));
  return Object.freeze(pieces);
}

export function compileCourseBandGround(elements: readonly BandElementDocument[], length: number, path: string) {
  try {
    return compileBandGround(length, expandCourseBands(elements, length, path));
  } catch (error) {
    if (error instanceof RangeError)
      throw new CourseInputError(
        /exceed|limit/i.test(error.message) ? 'resource_limit' : 'invalid_profile',
        path,
        error.message,
      );
    throw error;
  }
}

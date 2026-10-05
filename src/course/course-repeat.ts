import { CourseInputError } from './course-diagnostics.js';

export interface RepeatDocument<T> {
  readonly kind: 'repeat';
  readonly every: number;
  readonly count: number;
  readonly elements: readonly RepeatElement<T>[];
}
export type RepeatElement<T> = T | RepeatDocument<T>;

function isRepeat<T extends object>(element: RepeatElement<T>): element is RepeatDocument<T> {
  return 'kind' in element && element.kind === 'repeat';
}

/** One repetition enclosing an expanded element: the repeat's JSON Pointer and the repetition's index, 0 the original. */
export interface CourseRepeatCopy {
  readonly path: string;
  readonly index: number;
}

/**
 * Depth-first authored order; offsets accumulate without changing the leaf's native Position. `visit` also receives the
 * repetitions enclosing the element, outermost first (none when it is not repeated).
 */
export function expandCourseElements<T extends object>(
  elements: readonly RepeatElement<T>[],
  path: string,
  workLimit: number,
  visit: (element: T, offset: number, path: string, repeated: boolean, copies: readonly CourseRepeatCopy[]) => void,
): void {
  let work = 0;
  const expand = (
    items: readonly RepeatElement<T>[],
    offset: number,
    path: string,
    copies: readonly CourseRepeatCopy[],
  ) => {
    items.forEach((element, index) => {
      const at = `${path}/${index}`;
      if (++work > workLimit) throw new CourseInputError('resource_limit', at, 'Repeat expansion work limit exceeded');
      if (isRepeat(element)) {
        for (let i = 0; i < element.count; i++) {
          if (++work > workLimit)
            throw new CourseInputError('resource_limit', at, 'Repeat expansion work limit exceeded');
          expand(element.elements, offset + i * element.every, `${at}/elements`, [
            ...copies,
            Object.freeze({ path: at, index: i }),
          ]);
        }
      } else visit(element, offset, at, copies.length > 0, copies);
    });
  };
  expand(elements, 0, path, []);
}

export function shiftedCoursePosition<T>(
  resolve: (at: T, path: string) => Readonly<{ s: number }>,
  offset: number,
  length: number,
) {
  return (at: T, path: string): Readonly<{ s: number }> => {
    const s = resolve(at, path).s + offset;
    if (!Number.isFinite(s) || s < 0 || s > length)
      throw new CourseInputError('invalid_position', path, 'Repeated Position is outside its Section or wall');
    return Object.freeze({ s });
  };
}

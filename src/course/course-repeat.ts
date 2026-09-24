import { CourseInputError } from './course-diagnostics.js';

export interface RepeatDocument<T> {
  readonly kind: 'repeat';
  readonly every: number;
  readonly count: number;
  readonly elements: readonly RepeatElement<T>[];
}
export type RepeatElement<T> = T | RepeatDocument<T>;

export function isRepeat<T extends object>(element: RepeatElement<T>): element is RepeatDocument<T> {
  return 'kind' in element && element.kind === 'repeat';
}

/** Depth-first authored order; offsets accumulate without changing the leaf's native Position. */
export function expandCourseElements<T extends object>(
  elements: readonly RepeatElement<T>[],
  path: string,
  workLimit: number,
  visit: (element: T, offset: number, path: string, repeated: boolean) => void,
): void {
  let work = 0;
  const expand = (items: readonly RepeatElement<T>[], offset: number, path: string, repeated: boolean) => {
    items.forEach((element, index) => {
      const at = `${path}/${index}`;
      if (++work > workLimit) throw new CourseInputError('resource_limit', at, 'Repeat expansion work limit exceeded');
      if (isRepeat(element)) {
        for (let i = 0; i < element.count; i++) {
          if (++work > workLimit)
            throw new CourseInputError('resource_limit', at, 'Repeat expansion work limit exceeded');
          expand(element.elements, offset + i * element.every, `${at}/elements`, true);
        }
      } else visit(element, offset, at, repeated);
    });
  };
  expand(elements, 0, path, false);
}

export function shiftedCoursePosition<T>(
  resolve: (at: T, path: string) => Readonly<{ s: number }>,
  offset: number,
  length: number,
) {
  return (at: T, path: string): Readonly<{ s: number }> => {
    const s = resolve(at, path).s + offset;
    if (!Number.isFinite(s) || s < 0 || s > length)
      throw new CourseInputError('invalid_position', path, 'Repeated Position is outside the Section');
    return Object.freeze({ s });
  };
}

import { CourseInputError, courseFailure, courseSuccess, requireCourse } from '../course-diagnostics.js';

export interface CourseQueryExtent {
  readonly behind: number;
  readonly ahead: number;
  readonly left: number;
  readonly right: number;
}
const axes = ['behind', 'ahead', 'left', 'right'] as const;

function record(input: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  requireCourse(
    input !== null && typeof input === 'object' && !Array.isArray(input),
    path,
    'Expected a record',
    'invalid_shape',
  );
  const value = input as Record<string, unknown>;
  requireCourse(
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)),
    path,
    `Expected exactly ${keys.join(', ')}`,
    'invalid_shape',
  );
  return value;
}

function extent(input: unknown, path: string): CourseQueryExtent {
  const value = record(input, axes, path);
  const number = (key: (typeof axes)[number]) => {
    const n = value[key];
    requireCourse(typeof n === 'number', `${path}/${key}`, 'Expected metres', 'invalid_shape');
    requireCourse(
      Number.isFinite(n) && n >= 0,
      `${path}/${key}`,
      'Extent must be finite and nonnegative',
      'invalid_numeric_domain',
    );
    return n === 0 ? 0 : n;
  };
  return Object.freeze({
    behind: number('behind'),
    ahead: number('ahead'),
    left: number('left'),
    right: number('right'),
  });
}

/** Own explicit seam-local pose/step and named query footprints. No inferred consumer defaults. */
export function compileCourseConsumerDemand<const Name extends string>(input: unknown, consumers: readonly Name[]) {
  if (!Array.isArray(consumers) || [...consumers].some((name) => typeof name !== 'string'))
    throw new TypeError('Consumer names must be an array of strings');
  if (!consumers.length || consumers.some((name) => !name.length) || new Set(consumers).size !== consumers.length)
    throw new RangeError('Consumer names must be nonempty and unique');
  try {
    const value = record(input, ['pose', 'step', 'consumers'], '/demand');
    const pose = extent(value.pose, '/demand/pose'),
      step = extent(value.step, '/demand/step');
    const authored = record(value.consumers, consumers, '/demand/consumers');
    const requirements = Object.freeze(
      consumers.map((consumer) => {
        const footprint = extent(authored[consumer], `/demand/consumers/${consumer}`);
        const sum = (key: (typeof axes)[number]) => {
          const n = pose[key] + step[key] + footprint[key];
          requireCourse(
            Number.isFinite(n),
            `/demand/consumers/${consumer}/${key}`,
            'Expanded query extent must remain finite',
            'invalid_numeric_domain',
          );
          return n;
        };
        return Object.freeze({
          consumer,
          footprint,
          bounds: Object.freeze({ behind: sum('behind'), ahead: sum('ahead'), left: sum('left'), right: sum('right') }),
        });
      }),
    );
    const maximum = (key: (typeof axes)[number]) => Math.max(...requirements.map((r) => r.bounds[key]));
    const bounds = Object.freeze({
      behind: maximum('behind'),
      ahead: maximum('ahead'),
      left: maximum('left'),
      right: maximum('right'),
    });
    requireCourse(
      Number.isFinite(bounds.left + bounds.right) && bounds.left + bounds.right > 0,
      '/demand',
      'Consumer query domain needs positive lateral extent',
      'invalid_numeric_domain',
    );
    return courseSuccess(Object.freeze({ pose, step, requirements, bounds }));
  } catch (error) {
    if (error instanceof CourseInputError) return courseFailure<never>(error);
    throw error;
  }
}

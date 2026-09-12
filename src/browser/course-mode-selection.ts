import { BROWSER_COURSE_KEYS } from './key-bindings.js';
import type { CourseRouteKind } from '../gameplay/course-mode.js';

export type BrowserCourseModeQuery = string;

const COURSE_RUNNERS = Object.freeze({
  LINEAR: 'main-linear.js',
  BRANCHING: 'main.js',
  CIRCUIT: 'main-circuit.js',
} as const);

export interface BrowserCourseModeSelection {
  readonly digitCode?: string;
  readonly numpadCode?: string;
  readonly label: string;
  readonly query: BrowserCourseModeQuery;
  readonly routeKind: CourseRouteKind;
  readonly entryName: (typeof COURSE_RUNNERS)[CourseRouteKind];
}

export function compileBrowserCourseModes<const Entry extends Omit<BrowserCourseModeSelection, 'entryName'>>(
  entries: readonly Entry[],
): readonly (Entry & Pick<BrowserCourseModeSelection, 'entryName'>)[] {
  const queries = new Set<string>();
  const keys = new Set<string>();
  return Object.freeze(
    entries.map((entry) => {
      if (
        typeof entry.query !== 'string' ||
        !entry.query.trim() ||
        entry.query.trim() !== entry.query ||
        typeof entry.label !== 'string' ||
        !entry.label.trim()
      ) {
        throw new RangeError('course query and label must be nonempty; query must be trimmed');
      }
      if (queries.has(entry.query)) throw new RangeError(`duplicate course query: ${entry.query}`);
      queries.add(entry.query);
      if (!Object.hasOwn(COURSE_RUNNERS, entry.routeKind)) throw new RangeError('unknown course route kind');
      for (const code of [entry.digitCode, entry.numpadCode]) {
        if (code === undefined) continue;
        if (typeof code !== 'string' || !code.trim() || keys.has(code)) {
          throw new RangeError(`invalid or duplicate course shortcut: ${code}`);
        }
        keys.add(code);
      }
      return Object.freeze({ ...entry, entryName: COURSE_RUNNERS[entry.routeKind] });
    }),
  );
}

export const BROWSER_COURSE_MODES = compileBrowserCourseModes([
  Object.freeze({
    ...BROWSER_COURSE_KEYS.linear,
    label: 'LINEAR',
    query: 'linear',
    routeKind: 'LINEAR',
  }),
  Object.freeze({
    ...BROWSER_COURSE_KEYS.branching,
    label: 'BRANCHING',
    query: 'branching',
    routeKind: 'BRANCHING',
  }),
  Object.freeze({
    ...BROWSER_COURSE_KEYS.circuit,
    label: 'TSUKUBA',
    query: 'circuit',
    routeKind: 'CIRCUIT',
  }),
  Object.freeze({
    ...BROWSER_COURSE_KEYS.fisco,
    label: 'FISCO',
    query: 'fisco',
    routeKind: 'CIRCUIT',
  }),
]);

export function formatBrowserCourseSelector(activeQuery: BrowserCourseModeQuery): string {
  return BROWSER_COURSE_MODES.map(
    (mode) =>
      `${mode.digitCode === undefined ? '' : `[${mode.digitCode.slice(-1)}] `}${mode.label}${mode.query === activeQuery ? '*' : ''}`,
  ).join('  ');
}

export function selectBrowserCourseMode(
  query: string | null,
  selections: readonly BrowserCourseModeSelection[] = BROWSER_COURSE_MODES,
): BrowserCourseModeSelection {
  const selected =
    selections.find((mode) => mode.query === query) ?? selections.find((mode) => mode.query === 'branching');
  if (selected === undefined) throw new RangeError('course selection requires a known query or the branching default');
  return selected;
}

export function browserCourseModeForKey(
  code: string,
  selections: readonly BrowserCourseModeSelection[] = BROWSER_COURSE_MODES,
): BrowserCourseModeSelection | null {
  return selections.find((mode) => mode.digitCode === code || mode.numpadCode === code) ?? null;
}

/** The catalog owns root membership; composition supplies only the builders for that membership. */
export function composeBrowserCourseContent<Kind extends CourseRouteKind, Content>(
  kind: Kind,
  builders: Readonly<Record<string, () => Content>> &
    Record<Extract<(typeof BROWSER_COURSE_MODES)[number], { routeKind: NoInfer<Kind> }>['query'], () => Content>,
  query: string | null,
): { mode: BrowserCourseModeSelection; content: Content } {
  const mode = selectBrowserCourseMode(query);
  if (mode.routeKind !== kind) throw new RangeError(`${kind} cannot compose ${mode.query}`);
  const build = Object.hasOwn(builders, mode.query) ? builders[mode.query] : undefined;
  if (build === undefined) throw new RangeError(`missing course builder: ${mode.query}`);
  return { mode, content: build() };
}

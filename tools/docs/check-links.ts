import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The links check: every relative link in the repository's Markdown (tracked and untracked but not ignored) names a
 * file or directory that exists, and a fragment on a link to Markdown names a heading of that document by GitHub's
 * slug. Each broken link is printed on one line, `file:line: target: reason`; the command exits 1 if there is one.
 * Links with a scheme (`https:`, `mailto:`) and links inside code are not checked, nor fragments on other files.
 */
const USAGE = 'Usage: npm run check:links';
const root = fileURLToPath(new URL('../..', import.meta.url));

if (process.argv.length !== 2) {
  console.error(USAGE);
  process.exit(2);
}

/** A link's destination where it is written. */
interface Link {
  readonly line: number;
  readonly target: string;
}

/** A Markdown document's lines outside fenced code, each with its 1-based line number. */
function proseLines(text: string): { line: number; text: string }[] {
  const lines: { line: number; text: string }[] = [];
  let fence: string | null = null;
  text.split('\n').forEach((source, index) => {
    const opener = /^ {0,3}(`{3,}|~{3,})/.exec(source)?.[1];
    if (fence !== null) {
      if (
        opener &&
        opener[0] === fence[0] &&
        opener.length >= fence.length &&
        !/\S/.test(source.trim().slice(opener.length))
      )
        fence = null;
    } else if (opener) fence = opener;
    else lines.push({ line: index + 1, text: source });
  });
  return lines;
}

/** A line's parts in order, its code spans marked and stripped of their backticks. */
function splitCode(text: string): { code: boolean; text: string }[] {
  return text.split(/(`+[^`]*?`+)/).map((part, index) => ({
    code: index % 2 === 1,
    text: index % 2 === 1 ? part.replace(/^`+|`+$/g, '') : part,
  }));
}

/** A document's inline links' and link definitions' destinations, outside code. */
function links(text: string): Link[] {
  const found: Link[] = [];
  for (const { line, text: source } of proseLines(text)) {
    const prose = splitCode(source)
      .filter((part) => !part.code)
      .map((part) => part.text)
      .join('');
    for (const match of prose.matchAll(/\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g))
      found.push({ line, target: match[1]!.replace(/^<|>$/g, '') });
    const definition = /^ {0,3}\[[^\]]+\]:\s*(\S+)/.exec(prose);
    if (definition) found.push({ line, target: definition[1]!.replace(/^<|>$/g, '') });
  }
  return found;
}

/** A heading's text as GitHub renders it: links and images by their text, emphasis, tags and code marks removed. */
function renderedText(heading: string): string {
  return splitCode(heading)
    .map(({ code, text }) =>
      code
        ? text
        : text
            .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
            .replace(/<[^>]+>/g, '')
            .replace(/(^|[^\p{L}\p{N}])_+([^_]+?)_+(?=[^\p{L}\p{N}]|$)/gu, '$1$2')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"'),
    )
    .join('');
}

/** GitHub's slug: lower case, everything but letters, marks, numbers, connectors, hyphens and spaces removed. */
function slug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

/** A document's heading fragments, a repeated slug numbered from its second occurrence as GitHub numbers it. */
function fragments(text: string): Set<string> {
  const occurrences = new Map<string, number>();
  for (const { text: source } of proseLines(text)) {
    const heading = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(source);
    if (!heading) continue;
    const base = slug(renderedText(heading[1] ?? ''));
    let anchor = base;
    while (occurrences.has(anchor)) {
      const count = occurrences.get(base)! + 1;
      occurrences.set(base, count);
      anchor = `${base}-${count}`;
    }
    occurrences.set(anchor, 0);
  }
  return new Set(occurrences.keys());
}

const documents = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '*.md'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\0')
  .filter((file) => file && existsSync(path.join(root, file)));
const texts = new Map(documents.map((file) => [file, readFileSync(path.join(root, file), 'utf8')]));
const fragmentsOf = new Map<string, Set<string>>();
const broken: string[] = [];

for (const [file, text] of texts) {
  for (const { line, target } of links(text)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const hash = target.indexOf('#');
    const pathPart = hash < 0 ? target : target.slice(0, hash);
    const fragment = hash < 0 ? null : target.slice(hash + 1);
    const report = (reason: string) => broken.push(`${file}:${line}: ${target}: ${reason}`);
    let resolved: string;
    try {
      const decoded = decodeURI(pathPart);
      resolved = decoded.startsWith('/')
        ? path.join(root, decoded)
        : decoded === ''
          ? path.join(root, file)
          : path.join(root, path.dirname(file), decoded);
    } catch {
      report('malformed path');
      continue;
    }
    const relative = path.relative(root, resolved).split(path.sep).join('/');
    if (relative.startsWith('..')) {
      report('outside the repository');
      continue;
    }
    if (!existsSync(resolved)) {
      report('no such file');
      continue;
    }
    if (fragment === null || !relative.endsWith('.md') || !statSync(resolved).isFile()) continue;
    let anchor: string;
    try {
      anchor = decodeURIComponent(fragment);
    } catch {
      report('malformed fragment');
      continue;
    }
    let anchors = fragmentsOf.get(relative);
    if (!anchors)
      fragmentsOf.set(relative, (anchors = fragments(texts.get(relative) ?? readFileSync(resolved, 'utf8'))));
    if (!anchors.has(anchor)) report(`no heading #${anchor} in ${relative}`);
  }
}

for (const line of broken) console.log(line);
if (broken.length > 0) process.exitCode = 1;

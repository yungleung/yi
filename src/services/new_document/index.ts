/**
 * A new note: the id and the date the app stamps, and the frontmatter it opens with.
 *
 * The user's ask is that a new file be named after a generated fourteen-digit id and start
 * from a frontmatter carrying `title`, `date`, `id` and `keywords` — and that the reader may
 * write a template of their own while those four keys stay. The whole rule is here, as pure
 * functions over strings, so the Node check (`test/checks/check-new-document.mjs`) asserts
 * every case without a browser: the dialog and the tree both make their text through this
 * module rather than each spelling a frontmatter of their own.
 *
 * **What the reader owns and what the app stamps.** `title` and `keywords` are the reader's:
 * what the template says stands, and a template that leaves one out — or writes it empty —
 * gets the default (`Untitle`, `untagged`). `date` and `id` are the app's: a note is made
 * once, and a template naming them is naming *where* they go, not what they say, so their
 * values are stamped over whatever the template wrote there. A key the template does not
 * name at all is appended, in the order the ask lists the four.
 *
 * May import: the YAML parser for package metadata. Upholds: one home for the shape of a new note
 * — the id's digits, the date's, the required keys and where the title's value sits in the text —
 * so the file name, the frontmatter and the editor's selection cannot drift apart.
 */

import { isMap, parseDocument } from 'yaml';

/**
 * The keys every note carries. The reader may add more, and may write them anywhere in the
 * frontmatter; these four are the app's to guarantee.
 */
export const REQUIRED_KEYS = ['title', 'date', 'id', 'keywords'] as const;

export type RequiredKey = (typeof REQUIRED_KEYS)[number];

/** The title a new note is made with. It opens selected, ready to be typed over. */
export const DEFAULT_TITLE = 'Untitle';

/** And the word a new note is filed under until the reader says otherwise. */
export const DEFAULT_KEYWORDS = 'untagged';

/**
 * The frontmatter a new note opens with when the reader has not written a template.
 *
 * It is written as the plainest statement of the shape — the four keys in the ask's own
 * order — rather than as a document already filled in: the empty `date` and `id` are the
 * places the stamp goes, and the settings window shows the reader this very text to edit.
 * `keywords` is the one required key whose value is a *list*, so its default is written the way
 * a list is: the key, then the words under it.
 */
export const DEFAULT_TEMPLATE = 'title: Untitle\ndate:\nid:\nkeywords:\n  - untagged';

/** What a new note is made with: the two the app generates, and the reader's template. */
export interface NewDocumentFields {
  /** The id the app generated (`newDocumentId`), stamped whether the template says so or not. */
  id: string;
  /** Today (`newDocumentDate`), stamped like the id. */
  date: string;
  /** The frontmatter the reader configured, or `DEFAULT_TEMPLATE`. */
  template?: string;
  /** A chosen package's `metadata.yaml`: its keys win over the reader's template, except the stamps. */
  metadata?: string;
}

/**
 * The whole of a new note: the frontmatter, closed by its `---` lines and followed by the
 * blank line that keeps a parser from reading the first paragraph as more frontmatter.
 *
 * Example: with id `20261101123045`, date `2026-11-01`, and the default template,
 * the result starts `---\ntitle: Untitle\ndate: 2026-11-01\nid: 20261101123045`.
 */
export function newDocumentText(fields: NewDocumentFields): string {
  const { id, date, template = DEFAULT_TEMPLATE, metadata } = fields;
  const stamp: Record<RequiredKey, string> = {
    title: DEFAULT_TITLE,
    date,
    id,
    keywords: DEFAULT_KEYWORDS
  };
  const source =
    metadata === undefined ? template : mergeFrontmatterTemplates(template, metadata);
  const written = frontmatterLines(source);
  const body: string[] = [];
  written.forEach((line, index) => {
    const key = keyOf(line);
    if (key === null || !isRequired(key)) {
      // An extra key, a comment, a blank line: the reader's, exactly as written.
      body.push(line);
      return;
    }
    if (key === 'id' || key === 'date') {
      body.push(`${key}: ${stamp[key]}`);
      return;
    }
    // A key the reader may fill: their words when they wrote any — on the line, or in the lines
    // under it — and the default when there are none.
    body.push(...(isEmptyKey(written, index) ? defaultLines(key, stamp[key]) : [line]));
  });
  for (const key of REQUIRED_KEYS) {
    if (!written.some((line) => keyOf(line) === key)) {
      body.push(...defaultLines(key, stamp[key]));
    }
  }
  return `---\n${body.join('\n')}\n---\n\n`;
}

/**
 * A package's metadata over the reader's default frontmatter.
 *
 * The package owns every key it names; the default supplies the keys it does not. `date` and `id`
 * are the two exceptions: they keep the package's position when it names them, but
 * [`newDocumentText`] stamps the app's values over both. Keeping this a text merge preserves the
 * reader's comments and the package's order rather than round-tripping either through a YAML value.
 *
 * Example: default `title: Untitle\nkeywords:\n  - untagged` merged with package
 * `title: Article\nauthor: Ada` produces `title: Article\nauthor: Ada\nkeywords:\n  - untagged`.
 */
export function mergeFrontmatterTemplates(defaultTemplate: string, metadata: string): string {
  const base = frontmatterLines(defaultTemplate).join('\n');
  const chosen = frontmatterLines(metadata).join('\n');
  if (chosen.trim() === '') {
    return base;
  }
  const parsed = parseDocument(chosen, { uniqueKeys: false });
  if (parsed.errors.length > 0) {
    throw new Error(`The template metadata is not valid YAML: ${parsed.errors[0].message}`);
  }
  if (parsed.contents !== null && !isMap(parsed.contents)) {
    throw new Error('The template metadata must be a YAML mapping.');
  }
  const baseBlocks = keyedBlocks(base);
  const chosenBlocks = keyedBlocks(chosen);
  const named = new Set(
    chosenBlocks.map((block) => block.key).filter((key): key is string => key !== null)
  );
  const merged = chosenBlocks.slice();
  for (const block of baseBlocks) {
    if (block.key === null) {
      if (chosenBlocks.length === 0) {
        merged.push(block);
      }
    } else if (!named.has(block.key)) {
      merged.push(block);
    }
  }
  return merged
    .map((block) => block.lines.join('\n'))
    .filter((block) => block.trim() !== '')
    .join('\n');
}

/**
 * How a required key is written when the template gives no value for it.
 *
 * `keywords` is a list, and a list is a key with its words under it: writing `keywords: untagged`
 * would make the file's own YAML say something else than the reader asked for.
 */
function defaultLines(key: RequiredKey, value: string): string[] {
  return key === 'keywords' ? ['keywords:', `  - ${value}`] : [`${key}: ${value}`];
}

/**
 * Whether the key a line names has no value: nothing after its colon, and nothing under it that
 * could be its value. A value written on the next line — a long title, a list of keywords — is
 * the author's, and must not be replaced by the default.
 */
function isEmptyKey(lines: string[], index: number): boolean {
  return valueOf(lines[index]) === '' && !continues(lines[index + 1]);
}

/** Whether a line is more indented than a key's own line, which makes it that key's value. */
function continues(line: string | undefined): boolean {
  return line !== undefined && /^\s+\S/.test(line);
}

/**
 * The id a new note is stamped with: `YYYYMMDDHHMMSS`, in the author's own time zone.
 *
 * Local time, not UTC, because the id is the author's own stamp on their own note — the ids
 * already in the fixtures read as the local time they were written at — and because the file
 * name a reader sees should sort by when *they* made it.
 *
 * Example: `newDocumentId(new Date(2026, 0, 2, 3, 4, 5))` returns `'20260102030405'`.
 */
export function newDocumentId(when: Date = new Date()): string {
  return newDocumentDate(when).replace(/-/g, '') + clock(when);
}

/** The date a new note is stamped with: `YYYY-MM-DD`, in the author's own time zone. */
export function newDocumentDate(when: Date = new Date()): string {
  return `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())}`;
}

/**
 * Where the frontmatter's `title` value is in the whole document, or null when there is no
 * frontmatter, no `title` line, or nothing after the colon.
 *
 * The editor selects this range when a new note opens, so the reader can type a title over
 * the default one; the quotes an author may have wrapped the value in are left outside it,
 * because a keystroke in their place would edit the quotes.
 */
export function titleRange(text: string): { start: number; end: number } | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)/.exec(text);
  if (!block) {
    return null;
  }
  const frontmatter = block[1];
  const line = /^[ \t]*title:[ \t]*(\S.*?)[ \t]*$/m.exec(frontmatter);
  if (!line) {
    return null;
  }
  const bodyStart = block.index + block[0].indexOf(frontmatter);
  let start = bodyStart + line.index + line[0].indexOf(line[1]);
  let end = start + line[1].length;
  const quote = text[start];
  if ((quote === '"' || quote === "'") && text[end - 1] === quote && end - start >= 2) {
    start += 1;
    end -= 1;
  }
  return { start, end };
}

export {
  BUILT_IN_NOTE_METADATA,
  BUILTIN_NOTE_TEMPLATES
} from './builtins';
export type { BuiltInNewNoteTemplate } from './builtins';
export { newNoteMetadata, newNoteTemplates } from './templates';
export type { NewNoteTemplate } from './templates';

/** The template's own lines, without the fences an author may have pasted with them. */
function frontmatterLines(template: string): string[] {
  const lines = template
    .split('\n')
    .map((line) => line.replace(/\r$/, ''));
  while (lines.length > 0 && lines[0].trim() === '') {
    lines.shift();
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  if (lines.length > 0 && lines[0].trim() === '---') {
    lines.shift();
  }
  if (lines.length > 0 && ['---', '...'].includes(lines[lines.length - 1].trim())) {
    lines.pop();
  }
  return lines;
}

interface FrontmatterBlock {
  key: string | null;
  lines: string[];
}

/**
 * The top-level blocks of a frontmatter, keyed by the name on their first line.
 *
 * A key's block runs through every indented value, list item and comment beneath it. A leading
 * comment is kept with the first key rather than becoming a key of its own.
 */
function keyedBlocks(text: string): FrontmatterBlock[] {
  const blocks: FrontmatterBlock[] = [];
  let current: FrontmatterBlock = { key: null, lines: [] };
  for (const line of text.split('\n')) {
    const match = /^([A-Za-z_][\w.-]*)\s*:/.exec(line);
    if (match) {
      if (current.lines.length > 0) {
        blocks.push(current);
      }
      current = { key: match[1], lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) {
    blocks.push(current);
  }
  return blocks;
}

/** The key a frontmatter line names, or null when it names none. */
function keyOf(line: string): string | null {
  const match = /^\s*([A-Za-z_][\w.-]*)\s*:/.exec(line);
  return match ? match[1] : null;
}

/** The value a frontmatter line gives, without the quotes it may be wrapped in. */
function valueOf(line: string): string {
  const colon = line.indexOf(':');
  return colon < 0
    ? ''
    : line
        .slice(colon + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
}

function isRequired(key: string): key is RequiredKey {
  return (REQUIRED_KEYS as readonly string[]).includes(key);
}

/** The clock part of the id: `HHMMSS`, local. */
function clock(when: Date): string {
  return two(when.getHours()) + two(when.getMinutes()) + two(when.getSeconds());
}

function two(value: number): string {
  return String(value).padStart(2, '0');
}

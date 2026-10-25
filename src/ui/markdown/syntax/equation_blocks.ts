/**
 * Reads one labeled display-math block and lowers its KaTeX environment.
 *
 * A targetable equation is written `[$$…$$]{…}`. The wrapper belongs to Yi's
 * equation layer; the TeX inside it remains author source. This module owns the
 * wrapper grammar, environment classification, and the single unnumbered body
 * every editor or writer receives.
 *
 * May import: the shared Pandoc attribute grammar. Upholds: one labeled block is
 * one equation object, and all native environment numbering has one lowering
 * home.
 */

import {
  closingFence,
  closesFrontmatter,
  frontmatterDelimiter,
  htmlBlockTerminator,
  openingFence
} from './markers';
import {
  attributeBlockAtEnd,
  type PandocAttributeBlock
} from './pandoc_attributes';

/** A top-level environment whose rows can otherwise accumulate equation numbers. */
export type EquationEnvironmentName =
  | 'equation'
  | 'align'
  | 'gather'
  | 'alignat'
  | 'aligned'
  | 'gathered'
  | 'alignedat'
  | 'split';

/** The one top-level environment in a display-math body, when it is supported. */
export interface EquationBody {
  environment: EquationEnvironmentName | null;
  starred: boolean;
  argument: string | null;
  /** The environment's body, or the complete plain formula, without boundary newlines. */
  inner: string;
  /** The complete body exactly as written. */
  source: string;
}

/** One `[$$…$$]{…}` block and every source range needed by the editor. */
export interface EquationBlockSource {
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  attribute: PandocAttributeBlock | null;
  math: string;
  body: EquationBody;
  source: string;
  from: number;
  to: number;
  mathFrom: number;
  mathTo: number;
}

/** One ordinary display-math block and its inner body range. */
export interface DisplayMathSource {
  math: string;
  body: EquationBody;
  from: number;
  to: number;
  mathFrom: number;
  mathTo: number;
}

/** Read one complete labeled display-math block, or null for ordinary source. */
export function readEquationBlock(source: string, from = 0): EquationBlockSource | null {
  if (!source.startsWith('[$$')) {
    return null;
  }
  const close = source.lastIndexOf('$$]');
  if (close < 3) {
    return null;
  }
  const tail = source.slice(close + 3);
  let attribute: PandocAttributeBlock | null = null;
  if (tail !== '{}') {
    const parsed = attributeBlockAtEnd(tail, tail.length, false);
    if (parsed === null || parsed.from !== 0 || parsed.to !== tail.length) {
      return null;
    }
    attribute = {
      ...parsed,
      from: from + close + 3,
      to: from + close + 3 + parsed.to
    };
  } else {
    attribute = {
      id: null,
      classes: [],
      attributes: {},
      from: from + close + 3,
      to: from + source.length,
      source: '{}',
      separatorFrom: from + close + 3,
      separator: ''
    };
  }
  const raw = source.slice(3, close);
  const leading = raw.startsWith('\r\n') ? 2 : raw.startsWith('\n') ? 1 : 0;
  const trailing = raw.endsWith('\r\n') ? 2 : raw.endsWith('\n') ? 1 : 0;
  const math = raw.slice(leading, raw.length - trailing);
  return {
    id: attribute.id,
    classes: attribute.classes,
    attributes: attribute.attributes,
    attribute,
    math,
    body: readEquationBody(math),
    source,
    from,
    to: from + source.length,
    mathFrom: from + 3 + leading,
    mathTo: from + close - trailing
  };
}

/** The opening line a block splitter recognizes. */
export function isEquationOpening(line: string): boolean {
  return line.trim() === '[$$';
}

/** Whether a line closes a labeled block and begins its final attribute block. */
export function closesEquation(line: string): boolean {
  const trimmed = line.trim();
  return /^\$\$\](?:\{.*\})?$/.test(trimmed);
}

/**
 * The document remark receives: every equation wrapper is written as ordinary
 * display math, with the wrapper punctuation and attributes hidden inside
 * whitespace so every source offset stays unchanged.
 *
 * Remark reads `[$$` as text, then reads the closing `$$` as the *opening* of a
 * formula that consumes everything below it. That would hide every later
 * heading, figure, link, and reference from the document parse. Replacing `[`
 * with one space and the closing bracket and attributes with spaces leaves
 * `$$ … $$` at the same offsets, so remark resumes normal parsing after the
 * equation while Yi still owns the original source.
 *
 * May import: the shared marker grammar. Upholds: parser input has the same
 * length and line structure as the note, and syntax inside fenced, display-math,
 * frontmatter, or terminating HTML blocks is never changed.
 */
export function equationsForParsers(markdown: string): string {
  const lines = sourceLines(markdown);
  const masks: Array<{ from: number; to: number }> = [];
  let index = 0;

  if (lines[0] && frontmatterDelimiter(lines[0].text)) {
    const close = lines.findIndex(
      (line, at) => at > 0 && closesFrontmatter(line.text)
    );
    if (close >= 0) {
      index = close + 1;
    }
  }

  while (index < lines.length) {
    const line = lines[index];
    const fence = openingFence(line.text);
    if (fence !== null) {
      index += 1;
      while (index < lines.length && !closingFence(lines[index].text, fence)) {
        index += 1;
      }
      index += 1;
      continue;
    }

    if (isEquationOpening(line.text)) {
      const close = lines.findIndex(
        (candidate, at) => at > index && closesEquation(candidate.text)
      );
      if (close >= 0) {
        const openingAt = line.start + leadingSpace(line.text);
        const closing = lines[close];
        const closingAt = closing.start + leadingSpace(closing.text);
        const closingEnd = closing.start + closing.text.trimEnd().length;
        masks.push({ from: openingAt, to: openingAt + 1 });
        masks.push({ from: closingAt + 2, to: closingEnd });
        index = close + 1;
        continue;
      }
    }

    const displayOpen = line.text.indexOf('$$');
    if (line.text.trimStart().startsWith('$$')) {
      const closesOnLine =
        line.text.indexOf('$$', displayOpen + 2) >= 0 &&
        line.text.trimEnd().endsWith('$$');
      if (!closesOnLine) {
        index += 1;
        while (index < lines.length) {
          const candidate = lines[index].text.trim();
          index += 1;
          if (candidate.startsWith('$$') || candidate.endsWith('$$')) {
            break;
          }
        }
        continue;
      }
    }

    const terminator = htmlBlockTerminator(line.text);
    if (terminator !== null) {
      index += 1;
      while (index < lines.length && !terminator.test(lines[index].text)) {
        index += 1;
      }
      index += 1;
      continue;
    }

    index += 1;
  }

  if (masks.length === 0) {
    return markdown;
  }
  const parts: string[] = [];
  let copied = 0;
  for (const { from, to } of masks) {
    parts.push(markdown.slice(copied, from), ' '.repeat(to - from));
    copied = to;
  }
  parts.push(markdown.slice(copied));
  return parts.join('');
}

/** Read an ordinary `$$…$$` block, including the same-line form. */
export function readDisplayMath(source: string, from = 0): DisplayMathSource | null {
  const leading = source.length - source.trimStart().length;
  const open = source.indexOf('$$', leading);
  const close = source.lastIndexOf('$$');
  if (open !== leading || close <= open + 1) {
    return null;
  }
  const raw = source.slice(open + 2, close);
  const leadingNewline = raw.startsWith('\r\n') ? 2 : raw.startsWith('\n') ? 1 : 0;
  const trailingNewline = raw.endsWith('\r\n') ? 2 : raw.endsWith('\n') ? 1 : 0;
  const math = raw.slice(leadingNewline, raw.length - trailingNewline);
  return {
    math,
    body: readEquationBody(math),
    from,
    to: from + source.length,
    mathFrom: from + open + 2 + leadingNewline,
    mathTo: from + close - trailingNewline
  };
}

/** Classify the one supported environment in a math body. */
export function readEquationBody(source: string): EquationBody {
  const match =
    /^\s*\\begin\{(equation|align|gather|alignat|aligned|gathered|alignedat|split)(\*)?\}(?:(\{\d+\}))?([\s\S]*)\\end\{\1\2\}\s*$/.exec(
      source
    );
  if (match === null) {
    return { environment: null, starred: false, argument: null, inner: source, source };
  }
  return {
    environment: match[1] as EquationEnvironmentName,
    starred: match[2] === '*',
    argument: match[3] ?? null,
    inner: boundaryTrim(match[4] ?? ''),
    source
  };
}

/** Suppress top-level environment numbering while preserving every row. */
export function unnumberedEquationBody(body: EquationBody): string {
  if (body.environment === null || body.starred || innerEnvironment(body.environment)) {
    return body.source;
  }
  if (!numberedEnvironment(body.environment)) {
    return body.source;
  }
  const argument = body.argument ?? '';
  return `\\begin{${body.environment}*}${argument}\n${body.inner}\n\\end{${body.environment}*}`;
}

/** The unnumbered inner content KaTeX and non-LaTeX writers receive. */
export function innerEquationBody(body: EquationBody): string {
  const environment = body.environment;
  if (environment === null || environment === 'equation') {
    return body.inner;
  }
  if (environment === 'align' || environment === 'aligned') {
    return wrapEnvironment('aligned', body.inner);
  }
  if (environment === 'gather' || environment === 'gathered') {
    return wrapEnvironment('gathered', body.inner);
  }
  if (environment === 'alignat' || environment === 'alignedat') {
    return wrapEnvironment('alignedat', body.inner, body.argument ?? '');
  }
  return body.source;
}

/** One numbered outer equation for a labeled LaTeX/PDF target. */
export function latexEquationBody(body: EquationBody, id: string): string {
  const content =
    body.environment === null || body.environment === 'equation'
      ? body.inner
      : innerEquationBody(body);
  return `\\begin{equation}\n${content}\n\\label{${id}}\n\\end{equation}`;
}

/** One environment body with exactly one leading and trailing newline removed. */
function boundaryTrim(source: string): string {
  let start = 0;
  let end = source.length;
  if (source.startsWith('\r\n')) start = 2;
  else if (source.startsWith('\n')) start = 1;
  if (source.endsWith('\r\n')) end -= 2;
  else if (source.endsWith('\n')) end -= 1;
  return source.slice(start, end);
}

/** Whether the environment is already an unnumbered inner form. */
function innerEnvironment(name: EquationEnvironmentName): boolean {
  return name === 'aligned' || name === 'gathered' || name === 'alignedat' || name === 'split';
}

/** Whether the environment is one of the four that automatically number rows. */
function numberedEnvironment(name: EquationEnvironmentName): boolean {
  return name === 'equation' || name === 'align' || name === 'gather' || name === 'alignat';
}

/** One inner environment around the user's rows. */
function wrapEnvironment(name: string, inner: string, argument = ''): string {
  return `\\begin{${name}}${argument}\n${inner}\n\\end{${name}}`;
}

/** One source line, with the offset it begins at. */
function sourceLines(source: string): Array<{ start: number; text: string }> {
  const lines: Array<{ start: number; text: string }> = [];
  let start = 0;
  for (;;) {
    const newline = source.indexOf('\n', start);
    const end = newline < 0 ? source.length : newline;
    lines.push({ start, text: source.slice(start, end) });
    if (newline < 0) {
      return lines;
    }
    start = newline + 1;
  }
}

/** The indentation before a line's first non-whitespace character. */
function leadingSpace(line: string): number {
  return line.length - line.trimStart().length;
}

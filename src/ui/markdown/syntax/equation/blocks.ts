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
  attributeBlockAtEnd,
  type PandocAttributeBlock
} from '../pandoc_attributes';

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

/** Read one complete equation block whose final attributes are well formed. */
export function readEquationBlock(source: string, from = 0): EquationBlockSource | null {
  const read = readEquationWrapper(source, from);
  return read?.attributesValid ? read.block : null;
}

/**
 * Read the editor's structural equation wrapper even while an attribute token
 * is unfinished. A malformed tail has no target or classes, but its formula and
 * exact source remain visible until the author finishes the attribute.
 */
export function readEquationBlockSource(
  source: string,
  from = 0
): EquationBlockSource | null {
  return readEquationWrapper(source, from)?.block ?? null;
}

interface ReadEquationWrapper {
  block: EquationBlockSource;
  attributesValid: boolean;
}

function readEquationWrapper(
  source: string,
  from: number
): ReadEquationWrapper | null {
  if (!source.startsWith('[$$')) {
    return null;
  }
  const close = source.lastIndexOf('$$]');
  if (close < 3) {
    return null;
  }
  const tail = source.slice(close + 3);
  const attributesText = tail.trimEnd();
  if (attributesText !== '' && !attributesText.startsWith('{')) {
    return null;
  }
  const attribute = readEquationAttributes(tail, from + close + 3);
  const attributesValid = attributesText === '' || attribute !== null;
  const raw = source.slice(3, close);
  const leading = raw.startsWith('\r\n') ? 2 : raw.startsWith('\n') ? 1 : 0;
  const trailing = raw.endsWith('\r\n') ? 2 : raw.endsWith('\n') ? 1 : 0;
  const math = raw.slice(leading, raw.length - trailing);
  return {
    attributesValid,
    block: {
      id: attribute?.id ?? null,
      classes: attribute?.classes ?? [],
      attributes: attribute?.attributes ?? {},
      attribute,
      math,
      body: readEquationBody(math),
      source,
      from,
      to: from + source.length,
      mathFrom: from + 3 + leading,
      mathTo: from + close - trailing
    }
  };
}

/**
 * The final attribute block, allowing an empty `{}` and trailing spaces an
 * author is still typing. The block source owns those spaces; the attribute
 * range owns only the braces and their tokens.
 */
function readEquationAttributes(
  tail: string,
  from: number
): PandocAttributeBlock | null {
  const end = tail.trimEnd().length;
  const attributes = tail.slice(0, end);
  if (/^\{\s*\}$/.test(attributes)) {
    return {
      id: null,
      classes: [],
      attributes: {},
      from,
      to: from + end,
      source: attributes,
      separatorFrom: from,
      separator: ''
    };
  }
  const parsed = attributeBlockAtEnd(tail, end, false);
  if (parsed === null || parsed.from !== 0 || parsed.to !== end) {
    return null;
  }
  return {
    ...parsed,
    from: from + parsed.from,
    to: from + parsed.to
  };
}

/** The opening line a block splitter recognizes. */
export function isEquationOpening(line: string): boolean {
  return line.trim() === '[$$';
}

/** Whether a line closes a labeled block and begins its final attribute block. */
export function closesEquation(line: string): boolean {
  const trimmed = line.trim();
  return /^\$\$\](?:\{.*)?$/.test(trimmed);
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

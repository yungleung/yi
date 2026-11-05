/**
 * Builds the LaTeX theorem preamble that must survive alongside Yi's font
 * header.
 *
 * Example: a default `.Theorem` and `.Lemma` produce `\usepackage{amsthm}`,
 * a plain theorem style, and two `\newtheorem` declarations before Pandoc
 * writes the body.
 *
 * May import: the theorem vocabulary, frontmatter reader and YAML. Upholds:
 * declarations match the resolved note vocabulary and are emitted only when a
 * theorem exists.
 */

import { parseDocument } from 'yaml';
import { frontmatterText } from '../../markdown/syntax/markers';
import { parseMarkdown } from '../../markdown/syntax/parser';
import {
  theoremVocabularyFromFrontmatter,
  type TheoremType
} from '../../markdown/syntax/theorem';
import { latexText } from './header';

/** The generated LaTeX preamble for theorem environments. */
export function theoremHeader(markdown: string): string {
  if (!containsTheorem(parseMarkdown(markdown))) {
    return '';
  }
  const frontmatter = frontmatterText(markdown);
  const vocabulary = theoremVocabularyFromFrontmatter(frontmatter);
  const options = amsthmOptions(frontmatter);
  const lines = [
    '% Yi theorem environments; generated from the note vocabulary.',
    '\\usepackage{amsthm}'
  ];
  for (const style of customStyles(options.styles)) {
    lines.push(style);
  }
  if (options.swapnumbers) {
    lines.push('\\swapnumbers');
  }
  const proof = vocabulary.byClass.get('proof');
  if (proof !== undefined && proof.displayName !== 'Proof') {
    lines.push(
      `\\AtBeginDocument{\\renewcommand{\\proofname}{${latexText(proof.displayName)}}}`
    );
  }
  if (options.qedSymbol !== null) {
    lines.push(
      `\\renewcommand{\\qedsymbol}{\\ensuremath{${options.qedSymbol}}}`
    );
  }
  let style = '';
  for (const type of declarationOrder(vocabulary.types)) {
    if (type.style !== style) {
      style = type.style;
      lines.push(`\\theoremstyle{${style}}`);
    }
    lines.push(theoremDeclaration(type));
  }
  return `${lines.join('\n')}\n`;
}

/** Parent-counter declarations must precede the environments that borrow them. */
function declarationOrder(types: readonly TheoremType[]): TheoremType[] {
  const styleRank = (style: string): number =>
    style === 'plain'
      ? 0
      : style === 'definition'
        ? 1
        : style === 'remark'
          ? 2
          : 3;
  const remaining = types
    .filter((type) => type.style !== 'proof')
    .sort(
      (one, other) =>
        styleRank(one.style) - styleRank(other.style) ||
        one.className.localeCompare(other.className)
    );
  const emitted = new Set<string>();
  const ordered: TheoremType[] = [];
  while (remaining.length > 0) {
    let at = remaining.findIndex(
      (type) => type.counter === type.className || emitted.has(type.counter)
    );
    if (at < 0) at = 0;
    const [next] = remaining.splice(at, 1);
    ordered.push(next);
    emitted.add(next.className);
  }
  return ordered;
}

function theoremDeclaration(type: TheoremType): string {
  const title = latexText(type.displayName);
  if (!type.numbered) {
    return `\\newtheorem*{${type.className}}{${title}}`;
  }
  if (type.counter !== type.className) {
    return `\\newtheorem{${type.className}}[${type.counter}]{${title}}`;
  }
  const parent =
    type.parentCounter === null ? '' : `[${type.parentCounter}]`;
  return `\\newtheorem{${type.className}}{${title}}${parent}`;
}

function amsthmOptions(frontmatter: string | null): {
  styles: Record<string, unknown>;
  swapnumbers: boolean;
  qedSymbol: string | null;
} {
  if (frontmatter === null) {
    return { styles: {}, swapnumbers: false, qedSymbol: null };
  }
  const document = parseDocument(frontmatter);
  if (document.errors.length > 0) {
    return { styles: {}, swapnumbers: false, qedSymbol: null };
  }
  const root = document.toJS();
  const amsthm = isRecord(root) && isRecord(root.amsthm) ? root.amsthm : {};
  return {
    styles: isRecord(amsthm.styles) ? amsthm.styles : {},
    swapnumbers: amsthm.swapnumbers === true || amsthm.swapnumbers === 'true',
    qedSymbol:
      typeof amsthm.qed_symbol === 'string'
        ? amsthm.qed_symbol.replace(/^\$|\$$/g, '').trim() || null
        : null
  };
}

function customStyles(styles: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [name, raw] of Object.entries(styles)) {
    if (!isRecord(raw) || !/^[a-z][a-z0-9_-]*$/i.test(name)) continue;
    const headfont = latexFont(raw.headfont, '\\bfseries');
    const bodyfont =
      raw.bodyfont === undefined ? '\\normalfont' : latexFont(raw.bodyfont, '');
    const above = latexLength(raw.above, '');
    const below = latexLength(raw.below, '');
    const indent = latexLength(raw.indent, '');
    const headpunct = latexText(text(raw.headpunct, '.'));
    const headspace =
      text(raw.headspace, ' ') === 'newline'
        ? '\\newline'
        : latexLength(raw.headspace, ' ');
    lines.push(
      `\\newtheoremstyle{${name}}{${above}}{${below}}{${bodyfont}}{${indent}}{${headfont}}{${headpunct}}{${headspace}}{}`
    );
  }
  return lines;
}

function latexFont(value: unknown, fallback: string): string {
  const names = Array.isArray(value)
    ? value.map(String)
    : value === undefined
      ? []
      : [String(value)];
  const font = names
    .map((name) => {
      if (name === 'bold') return '\\bfseries';
      if (name === 'italic') return '\\itshape';
      if (name === 'smallcaps') return '\\scshape';
      if (name === 'normal') return '\\normalfont';
      return '';
    })
    .join('');
  return font || fallback;
}

function latexLength(value: unknown, fallback: string): string {
  const valueText = text(value, fallback);
  return /^[0-9.]+(?:pt|em|ex|cm|mm|in)$/.test(valueText) ? valueText : fallback;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function containsTheorem(tree: { children?: unknown[] }): boolean {
  for (const child of tree.children ?? []) {
    if (!isRecord(child)) continue;
    if (child.type === 'theorem' || containsTheorem(child)) return true;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

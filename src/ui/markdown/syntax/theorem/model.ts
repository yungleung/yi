/**
 * The resolved theorem vocabulary used by parsing, rendering, references and
 * export.
 *
 * Example: `Conjecture*` under `plain` resolves to class `Conjecture`, an
 * unnumbered `plain` block, and the display title `Conjecture`; an explicit
 * `name_to_text` entry can replace that title without changing the class.
 *
 * May import: nothing. Upholds: defaults and document metadata share one
 * declaration shape, and invalid declarations are reported rather than guessed.
 */

export type TheoremStyle = 'plain' | 'definition' | 'remark' | 'proof' | string;

export type TheoremParentCounter =
  | 'part'
  | 'chapter'
  | 'section'
  | 'subsection'
  | 'subsubsection'
  | 'paragraph'
  | 'subparagraph';

/** One environment as every theorem consumer sees it. */
export interface TheoremType {
  /** The case-sensitive class written in the fenced Div. */
  className: string;
  /** The name shown in the editor and in references. */
  displayName: string;
  style: TheoremStyle;
  /** The type whose counter this environment advances. */
  counter: string;
  numbered: boolean;
  parentCounter: TheoremParentCounter | null;
}

/** A declaration that could not be admitted to the resolved vocabulary. */
export interface TheoremIssue {
  kind: 'invalid-class' | 'duplicate-class' | 'invalid-parent-counter';
  className: string;
  detail: string;
}

/** The complete vocabulary for one parse or render. */
export interface TheoremVocabulary {
  types: readonly TheoremType[];
  byClass: ReadonlyMap<string, TheoremType>;
  issues: readonly TheoremIssue[];
  /** A deterministic value for parse and render cache keys. */
  key: string;
}

interface Declaration {
  sourceName: string;
  className: string;
  style: TheoremStyle;
  sharedCounter: string | null;
  numbered: boolean;
}

const PARENT_COUNTERS = new Set<TheoremParentCounter>([
  'part',
  'chapter',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph'
]);

const DEFAULT_DECLARATIONS: readonly Declaration[] = [
  { sourceName: 'Theorem', className: 'Theorem', style: 'plain', sharedCounter: null, numbered: true },
  { sourceName: 'Lemma', className: 'Lemma', style: 'plain', sharedCounter: 'Theorem', numbered: true },
  { sourceName: 'Corollary', className: 'Corollary', style: 'plain', sharedCounter: 'Theorem', numbered: true },
  { sourceName: 'Proposition', className: 'Proposition', style: 'plain', sharedCounter: null, numbered: true },
  { sourceName: 'Definition', className: 'Definition', style: 'definition', sharedCounter: null, numbered: true },
  { sourceName: 'Example', className: 'Example', style: 'definition', sharedCounter: null, numbered: true },
  { sourceName: 'Exercise', className: 'Exercise', style: 'definition', sharedCounter: null, numbered: true },
  { sourceName: 'Problem', className: 'Problem', style: 'definition', sharedCounter: null, numbered: true },
  { sourceName: 'Vocabulary', className: 'Vocabulary', style: 'definition', sharedCounter: null, numbered: true },
  { sourceName: 'Notation', className: 'Notation', style: 'remark', sharedCounter: null, numbered: true },
  { sourceName: 'Remark', className: 'Remark', style: 'remark', sharedCounter: null, numbered: true },
  { sourceName: 'proof', className: 'proof', style: 'proof', sharedCounter: null, numbered: false }
];

/** The built-in environments every note has when it says nothing. */
export const DEFAULT_THEOREM_VOCABULARY = resolveVocabulary(
  DEFAULT_DECLARATIONS,
  [],
  new Map(),
  new Map()
);

/** Whether a declared class is safe to use as a filter and LaTeX environment name. */
export function validTheoremClass(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*(?:\*)?$/.test(name);
}

/** The class name after pandoc-amsthm removes its optional unnumbered marker. */
export function theoremClassName(name: string): string {
  return name.endsWith('*') ? name.slice(0, -1) : name;
}

/** A readable title for a class that has no `name_to_text` entry. */
export function defaultTheoremTitle(className: string): string {
  return className
    .split('_')
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

/** Resolve declarations with duplicate removal and per-field metadata rules. */
export function resolveVocabulary(
  defaults: readonly Declaration[],
  declared: readonly Declaration[],
  titles: ReadonlyMap<string, string>,
  parentCounters: ReadonlyMap<string, TheoremParentCounter>
): TheoremVocabulary {
  const counts = new Map<string, number>();
  for (const declaration of declared) {
    counts.set(declaration.className, (counts.get(declaration.className) ?? 0) + 1);
  }
  const issues: TheoremIssue[] = [];
  const merged = new Map(defaults.map((declaration) => [declaration.className, declaration]));
  for (const declaration of declared) {
    if ((counts.get(declaration.className) ?? 0) > 1) {
      continue;
    }
    merged.set(declaration.className, declaration);
  }
  for (const [className, count] of counts) {
    if (count > 1) {
      merged.delete(className);
      issues.push({
        kind: 'duplicate-class',
        className,
        detail: `${className} is declared ${count} times`
      });
    }
  }
  const declarations = [...merged.values()];
  const declarationByClass = new Map(
    declarations.map((declaration) => [declaration.className, declaration])
  );
  const types = declarations
    .map((declaration) => {
      const parent = parentCounters.get(declaration.sourceName) ??
        parentCounters.get(declaration.className) ??
        null;
      const counterDeclaration = declaration.sharedCounter === null
        ? null
        : declarationByClass.get(declaration.sharedCounter) ?? null;
      const counterParent = counterDeclaration === null
        ? null
        : parentCounters.get(counterDeclaration.sourceName) ??
          parentCounters.get(counterDeclaration.className) ??
          null;
      return {
        className: declaration.className,
        displayName: titles.get(declaration.sourceName) ??
          titles.get(declaration.className) ??
          defaultTheoremTitle(declaration.className),
        style: declaration.style,
        counter: declaration.sharedCounter ?? declaration.className,
        numbered: declaration.numbered,
        parentCounter: declaration.sharedCounter === null ? parent : counterParent
      } satisfies TheoremType;
    })
    .sort((one, other) => one.className.localeCompare(other.className));
  return {
    types,
    byClass: new Map(types.map((type) => [type.className, type])),
    issues,
    key: JSON.stringify(
      types.map((type) => [
        type.className,
        type.displayName,
        type.style,
        type.counter,
        type.numbered,
        type.parentCounter
      ])
    )
  };
}

/** Build one declaration from names used by the metadata reader. */
export function theoremDeclaration(
  style: TheoremStyle,
  sourceName: string,
  sharedCounter: string | null
): Declaration {
  return {
    sourceName,
    className: theoremClassName(sourceName),
    style,
    sharedCounter,
    numbered: !sourceName.endsWith('*')
  };
}

/** Validate and store a parent counter without admitting an arbitrary string. */
export function readParentCounter(
  value: unknown
): TheoremParentCounter | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return PARENT_COUNTERS.has(text as TheoremParentCounter)
    ? text as TheoremParentCounter
    : null;
}

/** The fixed built-in declarations, exposed for the metadata resolver. */
export const BUILTIN_DECLARATIONS = DEFAULT_DECLARATIONS;

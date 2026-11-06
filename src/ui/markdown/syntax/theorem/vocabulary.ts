/**
 * Reads theorem declarations and their per-key options from YAML frontmatter.
 *
 * Example: a malformed `name_to_text` value leaves the matching theorem named
 * after its class while every other declaration remains available.
 *
 * May import: the YAML parser and the theorem model. Upholds: malformed or
 * ambiguous declarations fail independently and never disable unrelated types.
 */

import { parseDocument } from 'yaml';
import {
  BUILTIN_DECLARATIONS,
  DEFAULT_THEOREM_VOCABULARY,
  readParentCounter,
  resolveVocabulary,
  theoremDeclaration,
  validTheoremClass,
  type TheoremIssue,
  type TheoremParentCounter,
  type TheoremStyle,
  type TheoremVocabulary
} from './model';

const OPTION_KEYS = new Set([
  'styles',
  'name_to_text',
  'parent_counter',
  'counter_depth',
  'counter_ignore_headings',
  'css',
  'swapnumbers',
  'qed_symbol'
]);

/** The theorem vocabulary a note's YAML asks for, with defaults retained. */
export function theoremVocabularyFromFrontmatter(
  frontmatter: string | null
): TheoremVocabulary {
  if (frontmatter === null || frontmatter.trim() === '') {
    return DEFAULT_THEOREM_VOCABULARY;
  }
  const document = parseDocument(frontmatter);
  if (document.errors.length > 0) {
    return DEFAULT_THEOREM_VOCABULARY;
  }
  let root: unknown;
  try {
    root = document.toJS();
  } catch {
    return DEFAULT_THEOREM_VOCABULARY;
  }
  if (!isRecord(root) || !isRecord(root.amsthm)) {
    return DEFAULT_THEOREM_VOCABULARY;
  }

  const options = root.amsthm;
  const titles = readTitles(options.name_to_text);
  const styleNames = [
    ...new Set([
      'plain',
      'definition',
      'remark',
      ...Object.keys(isRecord(options.styles) ? options.styles : {}).sort()
    ])
  ];
  const declared = [];
  const issues: TheoremIssue[] = [];
  for (const style of styleNames) {
    if (OPTION_KEYS.has(style) || style === 'proof') {
      continue;
    }
    const entries = asList(options[style]);
    for (const entry of entries) {
      if (isRecord(entry)) {
        for (const sourceName of Object.keys(entry).sort()) {
          if (!validTheoremClass(sourceName)) {
            issues.push(invalidClass(style, String(sourceName)));
            continue;
          }
          const parent = theoremDeclaration(style, sourceName, null);
          declared.push(parent);
          for (const child of asList(entry[sourceName])) {
            const childName = stringValue(child);
            if (!validTheoremClass(childName)) {
              issues.push(invalidClass(style, childName));
              continue;
            }
            declared.push(theoremDeclaration(style, childName, parent.className));
          }
        }
      } else {
        const sourceName = stringValue(entry);
        if (!validTheoremClass(sourceName)) {
          issues.push(invalidClass(style, sourceName));
          continue;
        }
        declared.push(theoremDeclaration(style, sourceName, null));
      }
    }
  }
  const parentCounters = readParentCounters(
    options.parent_counter,
    declared.map((declaration) => declaration.sourceName)
  );
  const resolved = resolveVocabulary(
    BUILTIN_DECLARATIONS,
    declared,
    titles,
    parentCounters
  );
  return issues.length === 0
    ? resolved
    : { ...resolved, issues: [...resolved.issues, ...issues] };
}

function readTitles(value: unknown): ReadonlyMap<string, string> {
  const titles = new Map<string, string>();
  if (!isRecord(value)) {
    return titles;
  }
  for (const [name, title] of Object.entries(value)) {
    if (validTheoremClass(name) && typeof title === 'string' && title.trim() !== '') {
      titles.set(name, title.trim());
    }
  }
  return titles;
}

function readParentCounters(
  value: unknown,
  declaredNames: readonly string[]
): ReadonlyMap<string, TheoremParentCounter> {
  const counters = new Map<string, TheoremParentCounter>();
  if (typeof value === 'string') {
    const counter = readParentCounter(value);
    if (counter !== null) {
      for (const declaration of BUILTIN_DECLARATIONS) {
        counters.set(declaration.sourceName, counter);
      }
      for (const name of declaredNames) {
        counters.set(name, counter);
      }
    }
    return counters;
  }
  if (!isRecord(value)) {
    return counters;
  }
  for (const [name, raw] of Object.entries(value)) {
    const counter = readParentCounter(raw);
    if (counter !== null && validTheoremClass(name)) {
      counters.set(name, counter);
    }
  }
  return counters;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function invalidClass(style: TheoremStyle, className: string): TheoremIssue {
  return {
    kind: 'invalid-class',
    className,
    detail: `${className || '<empty>'} under ${style} is not a safe theorem class`
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

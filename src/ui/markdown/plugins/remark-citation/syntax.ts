/**
 * micromark syntax extension for pandoc citations.
 *
 * A text construct on `[` that consumes a bracketed span containing at least
 * one `@` as a single literal `citation` token. It deliberately fails (and
 * lets the core constructs take over) for:
 *
 * - `![…]` images (previous char is `!`)
 * - `\[…\]` escaped brackets (previous char is `\`)
 * - `[…](…)` link labels (the code right after `]` is `(`)
 * - spans without any `@`
 *
 * Narrative citations (`@key` in running text) are a second text construct on
 * `@`. A key starts with a letter, digit or `_` and continues with those plus
 * the pandoc punctuation set `:.#$%&-+?<>~/`. Punctuation is only kept when it
 * is internal (followed by another key character), so `@key.` keeps the period
 * outside the citation — matching pandoc. The `@` must not be preceded by an
 * alphanumeric (emails like `contact@example.com`) or a backslash (escaped
 * `\@key`); pandoc allows every other previous character, including `/` in a
 * URL path. A bracketed locator (`@key [p. 33]`) is part of the citation.
 *
 * May import: the micromark extension APIs. Upholds: the construct is recognised
 * from the token stream alone — the bracket content stays literal, so the raw
 * source of a citation is what the reader typed.
 */
import { asciiAlphanumeric } from 'micromark-util-character';
import { markdownLineEnding } from 'micromark-util-character';
import type {
  Code,
  Construct,
  Effects,
  Extension,
  State,
  TokenizeContext
} from 'micromark-util-types';

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    citation: 'citation';
    citationKeyPunctuation: 'citationKeyPunctuation';
    citationNarrativeLocator: 'citationNarrativeLocator';
  }
}

const OPEN_BRACKET = 91;
const CLOSE_BRACKET = 93;
const AT_SIGN = 64;
const BACKSLASH = 92;
const EXCLAMATION = 33;
const OPEN_PAREN = 40;
const UNDERSCORE = 95;
const SPACE = 32;
const HYPHEN = 45;

/** Characters allowed inside a narrative citation key (pandoc's set). */
const KEY_PUNCTUATION = new Set([58, 46, 35, 36, 37, 38, 45, 43, 63, 60, 62, 126, 47]);

/**
 * Whether `code` may be part of a citation key: a letter, a digit, `_`, or one of pandoc's
 * punctuation characters. Exported because the completion popup has to ask the same question —
 * where a citation key starts and what may be typed inside one (`syntax/completions.ts`) — and two
 * answers to it would be a popup that offers what the syntax will not read.
 */
export function citationKeyCharacter(code: number): boolean {
  return asciiAlphanumeric(code) || code === UNDERSCORE || KEY_PUNCTUATION.has(code);
}

/**
 * Whether an `@` may start a citation after the character `before` (`NaN` at the top of the text):
 * not after a letter or a digit — that is an email — and not after a backslash, which escapes it.
 */
export function citationPrecedesAt(before: number): boolean {
  return Number.isNaN(before) || (!asciiAlphanumeric(before) && before !== BACKSLASH);
}

export function citationSyntax(): Extension {
  return {
    text: {
      [OPEN_BRACKET]: parentheticalConstruct,
      [AT_SIGN]: narrativeConstruct,
      [HYPHEN]: narrativeSuppressConstruct
    }
  };
}

const parentheticalConstruct: Construct = {
  name: 'citationParenthetical',
  tokenize: tokenizeParentheticalCitation,
  previous: previousParentheticalCitation
};

const narrativeConstruct: Construct = {
  name: 'citationNarrative',
  tokenize: tokenizeNarrativeCitation,
  previous: previousNarrativeCitation
};

const narrativeSuppressConstruct: Construct = {
  name: 'citationNarrativeSuppress',
  tokenize: tokenizeNarrativeSuppress,
  previous: previousNarrativeSuppress
};

/** Consumes one punctuation char and verifies another key char follows it. */
const keyPunctuationContinue: Construct = {
  name: 'citationKeyPunctuation',
  tokenize: tokenizeKeyPunctuation
};

/** Consumes an optional space plus a bracketed locator: ` [p. 33]` or `[p. 33]`. */
const narrativeLocator: Construct = {
  name: 'citationNarrativeLocator',
  tokenize: tokenizeNarrativeLocator
};

function previousParentheticalCitation(this: TokenizeContext, code: Code): boolean {
  // Micromark passes the code *before* the construct to `previous`, so `code`
  // is the character right before `[`. Skip `![…]` (image) and `\[…\]`.
  return code !== EXCLAMATION && code !== BACKSLASH;
}

function tokenizeParentheticalCitation(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  let hasAtSign = false;

  return start;

  function start(code: Code) {
    effects.enter('citation');
    effects.consume(code); // `[`
    return content;
  }

  function content(code: Code) {
    if (code === BACKSLASH) {
      // Escaped character inside the citation: keep it literal.
      effects.consume(code);
      return escaped;
    }
    if (code === OPEN_BRACKET) {
      // Nested brackets are not part of pandoc citation syntax.
      effects.exit('citation');
      return nok(code);
    }
    if (code === CLOSE_BRACKET) {
      if (!hasAtSign) {
        effects.exit('citation');
        return nok(code);
      }
      effects.consume(code); // `]`
      effects.exit('citation');
      return after;
    }
    if (code === null || markdownLineEnding(code)) {
      effects.exit('citation');
      return nok(code);
    }
    if (code === AT_SIGN) {
      hasAtSign = true;
    }
    effects.consume(code);
    return content;
  }

  function escaped(code: Code) {
    if (code === null) {
      effects.exit('citation');
      return nok(code);
    }
    effects.consume(code);
    return content;
  }

  function after(code: Code) {
    // `[…]` immediately followed by `(` is a link label, not a citation.
    if (code === OPEN_PAREN) {
      return nok(code);
    }
    return ok(code);
  }
}

function previousNarrativeCitation(this: TokenizeContext, code: Code): boolean {
  // `code` is the character right before `@`: skip alphanumerics (emails like
  // `contact@example.com`, `foo@bar`) and backslash (`\@key`).
  // Pandoc allows `@` after any other character, including `/` in URLs.
  return typeof code !== 'number' || (!asciiAlphanumeric(code) && code !== BACKSLASH);
}

function tokenizeNarrativeCitation(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  return start;

  function start(code: Code) {
    effects.enter('citation');
    effects.consume(code); // `@`
    return createNarrativeKeyStates(effects, ok, nok).keyStart;
  }
}

/**
 * `-@key` (narrative suppress-author): the dash is part of the citation so the
 * rendered form is a bare parenthetical year and revealing the node shows the
 * full `-@key` source. The dash is only treated as a citation when it is not
 * attached to a word (`foo-@key` keeps the dash as text, matching pandoc).
 */
function previousNarrativeSuppress(this: TokenizeContext, code: Code): boolean {
  // `code` is the character right before the `-`. The dash is only a
  // suppress-author marker when it is not attached to a word, escaped, or
  // doubled (`foo-@key` keeps the dash as text, matching pandoc).
  return (
    typeof code !== 'number' ||
    (!asciiAlphanumeric(code) &&
      code !== UNDERSCORE &&
      code !== BACKSLASH &&
      code !== HYPHEN)
  );
}

function tokenizeNarrativeSuppress(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  return start;

  function start(code: Code) {
    effects.enter('citation');
    effects.consume(code); // `-`
    return at;
  }

  function at(code: Code) {
    if (code !== AT_SIGN) {
      effects.exit('citation');
      return nok(code);
    }
    effects.consume(code); // `@`
    return createNarrativeKeyStates(effects, ok, nok).keyStart;
  }
}

/** Shared key + locator state machine used by both `@key` and `-@key`. */
function createNarrativeKeyStates(
  effects: Effects,
  ok: State,
  nok: State
): { keyStart: State } {
  function keyStart(code: Code) {
    if (!isKeyStartChar(code)) {
      effects.exit('citation');
      return nok(code);
    }
    effects.consume(code);
    return key;
  }

  function key(code: Code) {
    if (isKeyStartChar(code)) {
      effects.consume(code);
      return key;
    }
    if (isKeyPunctuation(code)) {
      // Punctuation is only part of the key when another key character
      // follows it; otherwise it belongs to the surrounding text
      // (`@key.` at the end of a sentence keeps the period outside).
      return effects.attempt(keyPunctuationContinue, key, afterKey)(code);
    }
    return afterKey(code);
  }

  function afterKey(code: Code) {
    // A bracketed locator (`@key [p. 33]` or `@key[p. 33]`) belongs to the
    // citation, exactly like pandoc's narrative locator syntax.
    if (code === SPACE || code === OPEN_BRACKET) {
      return effects.attempt(narrativeLocator, endCitation, endCitation)(code);
    }
    return endCitation(code);
  }

  function endCitation(code: Code) {
    effects.exit('citation');
    return ok(code);
  }

  return { keyStart };
}

function isKeyStartChar(code: Code): boolean {
  return typeof code === 'number' && (asciiAlphanumeric(code) || code === UNDERSCORE);
}

function isKeyPunctuation(code: Code): boolean {
  return typeof code === 'number' && KEY_PUNCTUATION.has(code);
}

function tokenizeKeyPunctuation(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  return start;

  function start(code: Code) {
    effects.enter('citationKeyPunctuation');
    effects.consume(code);
    return check;
  }

  function check(code: Code) {
    // If the character after the punctuation is not part of a key, fail so
    // the punctuation is left for the surrounding text.
    if (isKeyStartChar(code)) {
      effects.exit('citationKeyPunctuation');
      return ok(code);
    }
    return nok(code);
  }
}

function tokenizeNarrativeLocator(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  return start;

  function start(code: Code) {
    effects.enter('citationNarrativeLocator');
    if (code === SPACE) {
      effects.consume(code);
      return open;
    }
    return open(code);
  }

  function open(code: Code) {
    if (code !== OPEN_BRACKET) {
      return nok(code);
    }
    effects.consume(code);
    return content;
  }

  function content(code: Code) {
    if (code === BACKSLASH) {
      effects.consume(code);
      return escaped;
    }
    if (code === OPEN_BRACKET || code === null || markdownLineEnding(code)) {
      return nok(code);
    }
    if (code === CLOSE_BRACKET) {
      effects.consume(code);
      effects.exit('citationNarrativeLocator');
      return ok(code);
    }
    effects.consume(code);
    return content;
  }

  function escaped(code: Code) {
    if (code === null || markdownLineEnding(code)) {
      return nok(code);
    }
    effects.consume(code);
    return content;
  }
}

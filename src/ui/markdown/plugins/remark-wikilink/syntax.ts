/**
 * micromark syntax extension for wikilinks.
 *
 * A text construct on `[` that consumes `[[filename]]` or
 * `[[filename|title]]` as a single literal `wikilink` token. It deliberately
 * fails (and lets the core constructs take over) for:
 *
 * - `![…]` images (previous char is `!`)
 * - `\[…\]` escaped brackets (previous char is `\`)
 * - anything without a second `[` and closing `]]` (so single-bracket syntax
 *   such as citations, footnotes, links, and task checkboxes is untouched)
 *
 * The raw source is kept on the token so the serializer round-trips it
 * exactly and the editor can reveal it on click.
 *
 * May import: the micromark extension APIs. Upholds: the construct is recognised
 * from the token stream alone — the bracket content stays literal, so the raw
 * source of a wikilink is what the reader typed.
 */
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
    wikilink: 'wikilink';
  }
}

const OPEN_BRACKET = 91;
const CLOSE_BRACKET = 93;
const BACKSLASH = 92;
const EXCLAMATION = 33;

export function wikilinkSyntax(): Extension {
  return {
    text: {
      [OPEN_BRACKET]: wikilinkConstruct
    }
  };
}

const wikilinkConstruct: Construct = {
  name: 'wikilink',
  tokenize: tokenizeWikilink,
  previous: previousWikilink
};

function previousWikilink(this: TokenizeContext, code: Code): boolean {
  // `code` is the character before `[`: skip `![` (image) and `\[` (escaped).
  return code !== EXCLAMATION && code !== BACKSLASH;
}

function tokenizeWikilink(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  let hasContent = false;

  return start;

  function start(code: Code) {
    effects.enter('wikilink');
    effects.consume(code); // first `[`
    return open;
  }

  function open(code: Code) {
    if (code !== OPEN_BRACKET) {
      effects.exit('wikilink');
      return nok(code);
    }
    effects.consume(code); // second `[`
    return content;
  }

  function content(code: Code) {
    if (code === BACKSLASH) {
      // Escaped character inside the wikilink: keep it literal.
      effects.consume(code);
      return escaped;
    }
    if (code === OPEN_BRACKET || code === null || markdownLineEnding(code)) {
      effects.exit('wikilink');
      return nok(code);
    }
    if (code === CLOSE_BRACKET) {
      if (!hasContent) {
        effects.exit('wikilink');
        return nok(code);
      }
      effects.consume(code); // first `]`
      return close;
    }
    hasContent = true;
    effects.consume(code);
    return content;
  }

  function close(code: Code) {
    if (code !== CLOSE_BRACKET) {
      effects.exit('wikilink');
      return nok(code);
    }
    effects.consume(code); // second `]`
    effects.exit('wikilink');
    return ok;
  }

  function escaped(code: Code) {
    if (code === null || markdownLineEnding(code)) {
      effects.exit('wikilink');
      return nok(code);
    }
    effects.consume(code);
    hasContent = true;
    return content;
  }
}

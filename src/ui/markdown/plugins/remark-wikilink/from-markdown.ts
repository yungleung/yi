/**
 * mdast-util-from-markdown extension turning `wikilink` tokens into mdast
 * `wikilink` nodes whose `value` is the raw markdown source (`[[filename]]` or
 * `[[filename|title]]`), preserving round-trips.
 */
import type { CompileContext, Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Token } from 'micromark-util-types';

export function wikilinkFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      wikilink: enterWikilink
    },
    exit: {
      wikilink: exitWikilink
    }
  };
}

function enterWikilink(this: CompileContext, token: Token): void {
  this.enter({ type: 'wikilink', value: '' } as any, token);
}

function exitWikilink(this: CompileContext, token: Token): void {
  const node = this.stack[this.stack.length - 1] as { value: string };
  node.value = this.sliceSerialize(token);
  this.exit(token);
}

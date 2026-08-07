/**
 * mdast-util-from-markdown extension turning `citation` tokens into mdast
 * `citation` nodes whose `value` is the raw markdown source of the citation
 * (`@key` for narrative, `[@key]` for parenthetical), preserving round-trips.
 */
import type { CompileContext, Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Token } from 'micromark-util-types';

export function citationFromMarkdown(): FromMarkdownExtension {
  return {
    enter: {
      citation: enterCitation
    },
    exit: {
      citation: exitCitation
    }
  };
}

function enterCitation(this: CompileContext, token: Token): void {
  this.enter({ type: 'citation', value: '' } as any, token);
}

function exitCitation(this: CompileContext, token: Token): void {
  const node = this.stack[this.stack.length - 1] as { value: string };
  node.value = this.sliceSerialize(token);
  this.exit(token);
}

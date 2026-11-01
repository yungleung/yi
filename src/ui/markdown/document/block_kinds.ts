/**
 * What a block's kind *means*: the kinds a document has, and the three questions the renderer, the
 * caret and the commands ask of one.
 *
 * The splitter (`blocks.ts`) decides which kind a slice of text is; this says what follows from
 * that decision — whether the kind is drawn as its own raw text, whether the caret inside it is
 * shown its markdown, whether it is a body between two delimiter lines, and whether that body is
 * what the reader sees. The two halves of `blocks.ts` used the same `BlockKind` and nothing else in
 * common, so this is where a reader looks for "what does `fencedCode` mean" without wading through
 * the splitting.
 *
 * May import: nothing. Upholds: one home for what a kind implies, so the renderer, the caret and
 * the editing rules cannot each spell out their own list of kinds.
 */

export type BlockKind =
  | 'quote'
  | 'fencedDiv'
  | 'frontmatter'
  | 'fencedCode'
  | 'indentedCode'
  | 'displayMath'
  | 'equation'
  | 'html'
  | 'descriptionList'
  | 'paragraph'
  | 'blank';

/**
 * Whether a block renders its raw source as it stands, without the markdown
 * it contains being parsed into nodes. Such a block's lines mean nothing to
 * the renderer beyond being text: a `- ` inside a code block is code, not an
 * empty list item.
 */
export function isRawRendered(kind: BlockKind): boolean {
  return (
    kind === 'frontmatter' ||
    kind === 'fencedCode' ||
    kind === 'indentedCode' ||
    kind === 'displayMath' ||
    kind === 'equation' ||
    kind === 'html'
  );
}

/**
 * Whether a block of this kind shows its own markdown text while the caret is
 * inside it, instead of its view.
 *
 * Every fenced block does: a display formula renders KaTeX and the other two render their body
 * with the delimiters hidden, so none of the three has a character to aim a caret at where its
 * own markdown is — the source view is the block's own text, delimiters and all
 * (`nodes/fence_text.ts`), and the caret maps through it one to one (see `source_mode/`).
 */
export function hasSourceMode(kind: BlockKind): boolean {
  return isFenced(kind);
}

/**
 * Whether a block of this kind is *fenced*: a body between two delimiter lines.
 *
 * The delimiters are drawn while the caret is inside the block and hidden the rest of the time
 * (`nodes/fence_text.ts`), and a typed character or a newline at the body's own edge belongs in
 * the body rather than on a delimiter's line (`syntax/container/fence_edits.ts`). An *indented* code block
 * is not one: it has no delimiter to keep a line for.
 */
export function isFenced(kind: BlockKind): boolean {
  return (
    kind === 'frontmatter' ||
    kind === 'fencedCode' ||
    kind === 'displayMath' ||
    kind === 'equation'
  );
}

/** Whether this block is a quote container that the Enter rules may edit. */
export function isQuoteLike(kind: BlockKind): boolean {
  return kind === 'quote';
}

/**
 * Whether a block of this kind renders its **body** while the caret is elsewhere: the two fenced
 * kinds that have no rendering of their own. A display formula's view is the KaTeX its parse draws
 * (`nodes/math.ts`), like any other node's view, so its body is not what the reader sees.
 */
export function hasBodyView(kind: BlockKind): boolean {
  return kind === 'frontmatter' || kind === 'fencedCode';
}

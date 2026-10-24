# Heading cross-references and attributes

## Problem

Yi has no way to create a durable internal reference to a heading. Pandoc already
supports the syntax this needs: ATX and setext headings may end with an attribute
block, and an internal link is written `[text](#id)`. Yi currently treats the
attribute block as part of the visible heading, does not give headings IDs, and
does nothing useful for a command-click on a fragment.

There is also a typing bug blocking the smallest heading gesture. On an empty body
line, typing `#` turns the line into an empty heading, after which the caret cannot
map back into that heading. Further `#` characters therefore cannot be typed.

This feature fixes that bug first, then makes heading attributes and
same-document cross-references work without inventing a second Markdown dialect.

## Syntax and compatibility

The source syntax is Pandoc Markdown.

- A heading may end with a Pandoc attribute block separated from its content by
  whitespace:

  ```markdown
  ## Methods {#methods .unnumbered data-owner=demo}
  ```

- An internal link uses the normal Markdown link spelling:

  ```markdown
  See [Methods](#methods).
  ```

- Only same-document fragments are in scope. A destination such as
  `note.md#methods` remains an ordinary file link and is not resolved by this
  feature.
- Heading attributes and cross-references are already valid Pandoc Markdown, so
  Pandoc exports and processed Markdown export preserve them unchanged.

The heading's ID is applied to the editor's rendered heading. Classes and other
attributes remain source and export metadata; they are not applied to Yi's DOM,
because arbitrary classes could change the editor's own layout.

## Heading attribute parsing

A new pure syntax module owns the construct. It accepts an attribute block only
when it is the heading's final token and whitespace separates it from the heading
content. It parses:

- the identifier (`#id`);
- classes (`.class`);
- key/value attributes (`key=value`, with Pandoc's quoted and escaped spelling);
- the exact raw range of the braces, plus the separator whitespace the parser
  removes from the heading title.

Malformed or non-trailing braces stay ordinary heading text. The rule applies to
ATX headings and setext headings.

The parser removes the attribute block from the heading node's rendered children
and retains its parsed values and source range on the heading. Its serializer emits
the original attribute block after the heading content. This separation keeps
attributes out of the visible title while preserving the author's source.

## Automatic identifiers

A document-level index assigns identifiers in document order using Pandoc's rules:

1. read the heading's plain text, without inline formatting, link wrappers,
   footnotes, or the trailing attribute block;
2. remove everything preceding the first letter;
3. replace whitespace with `-`;
4. lowercase the result;
5. remove punctuation except `_`, `-`, and `.`;
6. use `section` when nothing remains;
7. append `-1`, `-2`, and so on when an automatic identifier repeats an earlier
   one.

An explicit identifier is used as written. Pandoc leaves duplicate explicit IDs
duplicated and warns; Yi will resolve a fragment to the first matching explicit
heading. The user documentation will say that heading IDs should be unique.

The index is recalculated in document order after every text change. Inserting a
heading with the same title above an existing one therefore makes the new first
heading the base ID and gives the later heading the numeric suffix.

The index is parser-backed and cached by document text. It is computed lazily when
navigation first needs it, so ordinary editing does not pay for indexing every
heading. The implementation will measure the initial lookup on the fixture
document. Above 100 ms, the index must be optimized before the feature is
considered complete.

## Caret and rendering

The rendered heading shows only its text normally. While the caret is anywhere in
the heading's source range, the attribute block becomes visible source after the
title and is editable at its exact document offset. Leaving the heading hides it
again.

The attribute span carries the same source offset contract as other editable
source views. Its text is the document's characters, character for character, so
clicking and typing update the attribute block through the ordinary raw-text edit
path. The heading component does not parse Markdown or maintain an independent
copy of the attributes.

A heading with no title text must still hold a caret. Its renderer supplies an
addressable empty text position at the heading content start. This is the same
model empty paragraphs, list items, and table cells already use, and it is what
allows the user to type the first `#`, continue typing heading markers, add the
required space, and then type the heading text. Until that delimiter space is
typed, the `#` characters render as ordinary paragraph text rather than an
invisible empty heading; the space is the transition to heading rendering. The
empty heading keeps its level marker visible until title text exists, so the
reader can see which heading level the delimiter space created.

## Navigation

An internal fragment remains an ordinary link for every existing behavior:

- a plain click reveals the link's source for editing;
- ⌘-click and Ctrl-click are the navigation gesture, matching links, wikilinks,
  and footnotes;
- the webview never navigates to the fragment itself.

For a same-document fragment, command-click asks the document heading index for its
first target. The editor then reveals the heading's block, focuses the heading text,
and keeps the gesture from moving the webview through `location.hash`. A target may
be outside the mounted viewport; virtualized blocks are resolved from document text
and revealed through the renderer.

If no heading has the requested identifier, the document does not move. A
localized message names the missing target. A destination that is not a
same-document fragment keeps the existing link routing.

## Export

The export preprocessor does not rewrite heading attributes or cross-reference
links. Pandoc receives them in their native syntax, and processed Markdown keeps
them so the output remains navigable when opened in another Markdown reader.

This feature adds no Yi-only export conversion. Future Yi-only constructs may still
be lowered to Pandoc syntax or rendered text according to the larger advanced
syntax design.

## Fixture and documentation

`test/fixtures/workspace/default-document.md` gains a section demonstrating:

- automatic heading IDs;
- a repeated automatic heading and its numeric suffix;
- a custom heading ID;
- a class and key/value attribute;
- ATX and setext heading attributes;
- same-document links to each kind of target.

The fixture remains valid Pandoc Markdown and keeps its existing content. New
content is additive so unrelated probes continue to exercise their own constructs.

The bundled user guide
`src/ui/documentation/documentation.en.md` gains a section explaining the syntax,
the automatic-ID algorithm, duplicate-ID guidance, attribute visibility, and
command-click navigation. `docs/ai-context.md` and the architecture map will name
the new syntax, index, caret, and navigation homes.

## Testing

Node checks will cover:

- attribute recognition on ATX and setext headings;
- rejection of malformed, non-final, and unseparated braces;
- parsing IDs, classes, quoted values, and escapes;
- serialization preserving the attribute source;
- Pandoc-compatible automatic IDs, Unicode, leading nonletters, and fallbacks;
- duplicate automatic and explicit IDs;
- fragment classification and first-match target lookup.

The plain-edit property corpus will gain headings with attributes. The fast path may
only accept an edit when the document's parse shape and the heading's source
relationship remain valid.

Tauri probes will drive the real editor and assert raw text, rendered headings,
caret placement, scrolling, and click behavior:

- the blank-line heading sequence: click an empty body line, type `#` more than
  once, add a space and title, and verify the resulting heading and caret;
- attributes hidden while the caret is outside a heading, visible and editable
  while it is inside, using exact click and typing positions;
- command-click navigation to an automatic ID, duplicate suffix, custom ID, and
  setext heading;
- navigation to a target outside the mounted viewport without changing
  `location.hash`;
- unresolved fragments leaving the document in place and showing the message;
- plain clicks still revealing link source;
- processed Markdown export preserving the native attributes and links.

The blank-line bug gets a probe that fails before its fix. The cross-reference
checks fail before the parser extension. All app tests run against the running
Tauri app through its MCP bridge and include
`test/fixtures/workspace/default-document.md`; the app is restarted after branch
changes.

## Delivery

The blank-line fix and the cross-reference feature are separate, reviewable
changes:

1. `codex/type-heading-on-a-blank-line` fixes and proves the typing bug;
2. `codex/heading-cross-references` adds the parser, rendering, index,
   navigation, export coverage, documentation, and fixture example.

Neither branch is merged without an explicit request. The existing unrelated
`package-lock.json` and `src-tauri/Cargo.lock` modifications are preserved and
never included in these commits.

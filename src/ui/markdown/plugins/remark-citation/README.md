# remark-citation

Local remark plugin adding pandoc-style citation support to the editor's
markdown pipeline.

## Syntax

Pandoc citations are bracketed spans containing at least one `@`:

```markdown
[@smith2020]
[@smith2020, p. 45]
[-@smith2020]
[see @smith2020; also @jones2019, ch. 3]
```

Narrative citations are also supported:

```markdown
According to @smith2020, code reviews matter.
@smith2020 [p. 33] argues that …
-@smith2020 suppresses the author
```

A citation key starts with a letter, digit or `_` and continues with
alphanumerics, `_` and the pandoc punctuation set `:.#$%&-+?<>~/`. Like pandoc,
punctuation is only kept when it is internal (followed by another key
character), so `@key.` at the end of a sentence keeps the period outside. A
narrative `@` is recognized unless it is preceded by an alphanumeric (emails
like `user@example.com`, `foo@bar`) or a backslash (`\@key`); a `-` right
before the `@` (`-@key`) marks a suppress-author citation, unless the dash is
attached to a word (`foo-@key`).

Each citation becomes a `citation` mdast node whose `value` is the raw
markdown source (`@smith2020`, `@smith2020 [p. 33]`, `-@smith2020` or
`[@smith2020, p. 45]`), so serialization reproduces the exact source.

## Exclusions

The syntax deliberately does **not** match:

- image syntax: `![@key](…)`
- link labels: `[@key](…)`
- escaped brackets: `\[@key\]` (the `@key` inside still becomes a narrative
  citation, exactly as pandoc parses it)
- spans without an `@` (e.g. `[plain text]`)

Because it is a micromark text construct, the bracket content is kept literal
(no emphasis or links can form inside a citation).

## Rendering

The `citation` node renders as an APA-formatted span using the bundled
bibliography file configured in the app config (`bibliography_file`): a
Zotero CSL-JSON export or a BibTeX file. `[@smith2020]` becomes
“(Smith, 2020)”, `@smith2020` becomes “Smith (2020)”, locators and
prefixes/suffixes are carried through. Keys missing from the bibliography (or
a missing bibliography) are left exactly as typed. Clicking the span reveals
the raw markdown with the caret at the end.

## API

- `remarkCitation()` — remark plugin wiring the micromark syntax extension and
  the mdast-util from/to-markdown extensions.
- `citationSyntax()` — the micromark syntax extension.
- `citationFromMarkdown()` / `citationToMarkdown()` — the mdast-util extensions.
- `CitationNode` — the mdast node shape produced by the plugin.

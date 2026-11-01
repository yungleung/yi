/**
 * A definition written inside a container: a description detail, a list item and a
 * blockquote.
 *
 * A definition is a definition of the *document*, wherever it is written, so the
 * label the notes run draws and the source a click opens have to be the
 * definition's own characters — the block a detail's definition shares with its
 * list is not where those characters start, and a blockquote's definition sits
 * behind a `>` the line rule has to read past (`syntax/footnote/`) or a marker
 * elsewhere in the document never becomes a marker at all
 * (`footnote-container-jump.js` jumps to the note from each of them).
 *
 * A table cell is the shape markdown has no definition for and is measured in
 * `footnote-table-cell.js` instead.
 *
 * @covers src/ui/markdown/nodes/footnote.ts, src/ui/markdown/syntax/footnote/,
 *   src/ui/markdown/caret/offsets.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const drawnLabel = () => t.prose().querySelector('[data-footnote-def]');
  const shownLabel = () => t.prose().querySelector('[data-footnote-def].markdown-footnote-source');
  const click = async (element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      })
    );
    await t.sleep(200);
  };

  /** Loads `doc`, clicks the definition's label, and types `key` into it. */
  const editLabel = async (doc, key) => {
    await t.load(doc);
    const drawn = drawnLabel();
    const shape = { drawn: drawn?.textContent ?? null };
    await click(drawn);
    const source =
      shownLabel() ?? t.prose().querySelector('.markdown-quote-source');
    shape.tag = source?.tagName ?? null;
    shape.text = source?.textContent ?? null;
    // Block-relative, like every source view: the definition's own offset inside
    // its block, which is not zero for a definition that shares a block.
    shape.from = source?.dataset.sourceFrom ?? null;
    t.key(key);
    await t.sleep(300);
    shape.afterTyping = await t.raw();
    return shape;
  };

  const cases = [
    {
      name: 'a description detail',
      doc: 'a term\n\n: a detail with a note[^1] in it\n\n  [^1]: the note in the detail\n',
      sourceTag: 'SPAN',
      sourceText: '[^1]',
      from: '2',
      typed: 'a term\n\n: a detail with a note[^1] in it\n\n  [^19]: the note in the detail\n'
    },
    {
      name: 'a list item',
      doc: '- item text[^1] here\n\n  [^1]: the note in the item\n',
      sourceTag: 'SPAN',
      sourceText: '[^1]',
      from: '24',
      typed: '- item text[^1] here\n\n  [^19]: the note in the item\n'
    },
    {
      name: 'a blockquote',
      doc: '> quote text[^1] here\n>\n> [^1]: the note in the quote\n',
      sourceTag: 'PRE',
      sourceText: '> quote text[^1] here\n>\n> [^1]: the note in the quote',
      from: null,
      typed: '> quote text[^1] here\n>\n> [^19]: the note in the quote\n'
    }
  ];

  for (const shape of cases) {
    const seen = await editLabel(shape.doc, '9');
    check(`${shape.name}: the definition draws its label as the marker it is`, seen.drawn === '[1]', seen.drawn);
    check(
      `${shape.name}: a click opens the definition's exact editable source`,
      seen.tag === shape.sourceTag &&
        seen.text === shape.sourceText &&
        seen.from === shape.from,
      seen
    );
    check(
      `${shape.name}: and typing edits that definition's label`,
      seen.afterTyping === shape.typed,
      seen.afterTyping
    );
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

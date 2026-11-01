/**
 * A footnote and a table cell: the marker is a marker there, the definition is not.
 *
 * A marker written inside a cell is a reference like any other — the cell is text
 * and the definition that makes it one lives below the table — so it draws `[1]`
 * and jumps to its note. The other direction is the shape markdown has no
 * definition for: a cell holding `[^1]: note` is one line of a table, and a
 * definition is a whole line markdown reads at a container's own level, so those
 * characters stay the characters they are — no marker, no definition, the note
 * text sitting in the cell exactly as it was written.
 *
 * @covers src/ui/markdown/nodes/footnote.ts, src/ui/markdown/nodes/table.ts,
 *   src/ui/markdown/syntax/footnote/
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const marker = () => t.prose().querySelector('[data-footnote-ref]');
  const label = () => t.prose().querySelector('[data-footnote-def]');
  const cell = (row, column) =>
    t.prose().querySelector(`[data-table-cell="${row}:${column}"]`);
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range
      ? { node: range.startContainer, text: range.startContainer.textContent, offset: range.startOffset }
      : null;
  };
  const click = async (element, modifier = {}) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ...modifier,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      })
    );
    await t.sleep(300);
  };

  const doc = '| a[^1] | b |\n| --- | --- |\n| c | d |\n\n[^1]: the note\n';
  await t.load(doc);
  check(
    'a marker written in a table cell draws as a marker',
    marker()?.textContent === '[1]' && marker()?.dataset.footnoteRef === '1',
    marker() ? `${marker().tagName} ${marker().textContent}` : null
  );
  check(
    'and the cell holds its own characters around it',
    cell(0, 0)?.textContent === 'a[1]',
    cell(0, 0)?.textContent ?? null
  );
  check(
    'and the definition below the table is the one it names',
    label()?.textContent === '[1]' && label()?.dataset.footnoteDef === '1',
    label()?.textContent ?? null
  );

  await click(marker(), { metaKey: true });
  const landed = caret();
  const note = t.textNodesIn(t.prose()).find((node) => node.data.includes('the note')) ?? null;
  check(
    'and its jump lands at the start of the note`s text',
    landed !== null && note !== null && landed.node === note && landed.offset === 0,
    landed ? { text: landed.text?.slice(0, 12), offset: landed.offset } : null
  );
  check('and it left the document untouched', (await t.raw()) === doc, null);

  // A definition written where a definition cannot be one: a cell.
  const inCell = '| a[^1] | b |\n| --- | --- |\n| [^1]: note | d |\n';
  await t.load(inCell);
  check(
    'a definition written inside a table cell is not one',
    t.prose().querySelector('[data-footnote-ref]') === null &&
      t.prose().querySelector('[data-footnote-def]') === null,
    {
      markers: t.prose().querySelectorAll('[data-footnote-ref]').length,
      defs: t.prose().querySelectorAll('[data-footnote-def]').length
    }
  );
  check(
    'so the characters stay the characters they are',
    cell(1, 0)?.textContent === '[^1]: note',
    cell(1, 0)?.textContent ?? null
  );
  check('and the document is untouched', (await t.raw()) === inCell, null);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

/**
 * The jump, both ways, for a definition written inside a container.
 *
 * A ⌘-click on a marker goes to the note: the definition's block is scrolled into
 * view and the caret lands at the start of the note's own text. The target is the
 * definition's body offset, so it is the one thing that breaks when the definition
 * sits behind a container's marker and the line rule does not read past it — the
 * click then falls back to the marker's own reveal and the caret ends up inside
 * the marker (`[^1]`) instead of in the note. A ⌘-click on the label goes back to
 * the marker.
 *
 * @covers src/ui/markdown/editing/footnotes.ts, src/ui/markdown/syntax/footnotes.ts,
 *   src/ui/markdown/click_routing.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range
      ? { node: range.startContainer, text: range.startContainer.textContent, offset: range.startOffset }
      : null;
  };
  const marker = () => t.prose().querySelector('[data-footnote-ref]');
  const label = () => t.prose().querySelector('[data-footnote-def]');
  const inView = (element) => {
    const box = element.getBoundingClientRect();
    const scroller = t.scroller().getBoundingClientRect();
    return box.top >= scroller.top - 2 && box.bottom <= scroller.bottom + 2;
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
  const noteText = (words) => t.textNodesIn(t.prose()).find((node) => node.data.includes(words)) ?? null;

  const cases = [
    {
      name: 'a description detail',
      doc: 'a term\n\n: a detail with a note[^1] in it\n\n  [^1]: the note in the detail\n',
      words: 'the note in the detail'
    },
    {
      name: 'a list item',
      doc: '- item text[^1] here\n\n  [^1]: the note in the item\n',
      words: 'the note in the item'
    },
    {
      name: 'a blockquote',
      doc: '> quote text[^1] here\n>\n> [^1]: the note in the quote\n',
      words: 'the note in the quote'
    }
  ];

  for (const shape of cases) {
    await t.load(shape.doc);
    await click(marker(), { metaKey: true });
    const landed = caret();
    const note = noteText(shape.words);
    const block = note?.parentElement?.closest('.markdown-block') ?? null;
    check(
      `${shape.name}: a cmd-click lands the caret at the start of the note's own text`,
      landed !== null && note !== null && landed.node === note && landed.offset === 0,
      landed ? { text: landed.text?.slice(0, 24), offset: landed.offset } : null
    );
    check(
      `${shape.name}: and the note is on screen`,
      block !== null && inView(block),
      block ? { inView: inView(block) } : null
    );
    check(
      `${shape.name}: and it left the label drawn, not shown as a source`,
      label()?.textContent === '[1]' && !label().classList.contains('markdown-footnote-source'),
      label() ? `${label().tagName} ${label().textContent}` : null
    );

    await click(label(), { metaKey: true });
    const back = caret();
    const markerBox = marker()?.getBoundingClientRect() ?? null;
    const caretBox = t.caretRect();
    check(
      `${shape.name}: and a cmd-click on the label goes back to the marker`,
      caretBox !== null &&
        markerBox !== null &&
        caretBox.y >= markerBox.top - 6 &&
        caretBox.y <= markerBox.bottom + 6,
      { caret: caretBox, marker: markerBox ? t.rectOf(marker()) : null, back: back?.text?.slice(0, 12) }
    );
    check(
      `${shape.name}: leaving the document untouched`,
      (await t.raw()) === shape.doc,
      null
    );
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

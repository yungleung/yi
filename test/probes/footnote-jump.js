/**
 * What each gesture on a footnote marker does.
 *
 * A plain click belongs to the marker itself: it opens the label as its own source, in
 * place, and the page does not move (`footnote-source.js` types in it afterwards).
 * Ctrl-click and ⌘-click go to the note: the definition is scrolled into view if it is
 * below the window, and the caret lands at the start of the note's text, ready to be
 * written — in the note, never in the label.
 *
 * Neither gesture ever follows the `#fn-label` the rendering carries, which would take the
 * webview to the fragment and scroll the page a second time.
 *
 * @covers src/ui/markdown/click_routing.ts, src/ui/markdown/editing/footnotes.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  /** The block the note is written in, and the text node its words are in. */
  const note = () => {
    const block = t.blocks().find((element) => element.textContent.includes('The definition.'));
    if (!block) {
      return null;
    }
    const text = t.textNodesIn(block).find((node) => node.data.includes('The definition.'));
    return text ? { block, text } : null;
  };
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  };
  const inView = (element) => {
    const box = element.getBoundingClientRect();
    const scroller = t.scroller().getBoundingClientRect();
    return box.top >= scroller.top - 2 && box.bottom <= scroller.bottom + 2;
  };
  const click = (element, modifier = {}) => {
    const rect = element.getBoundingClientRect();
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      ...modifier,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    });
    element.dispatchEvent(event);
    return event;
  };
  const label = () => t.prose().querySelector('[data-footnote-def]');
  // Enough document that the note starts well below the window: the jump has to scroll.
  const filler = Array.from({ length: 40 }, (_, index) => `Line ${index + 1} of filler.`).join('\n\n');
  const doc = `Body text[^1] here.\n\n${filler}\n\n[^1]: The definition.\n`;

  // A plain click opens the marker where it is, and the page keeps its place.
  await t.load(doc);
  const before = Math.round(t.scroller().scrollTop);
  const plain = click(t.prose().querySelector('[data-footnote-ref]'));
  await t.sleep(400);
  const revealed = t.prose().querySelector('[data-footnote-ref].markdown-footnote-source');
  check(
    'a click shows the marker as its own source',
    revealed?.textContent === '[^1]',
    revealed?.textContent ?? null
  );
  check(
    'and does not follow the marker`s href',
    plain.defaultPrevented && location.hash === '',
    { prevented: plain.defaultPrevented, hash: location.hash }
  );
  check(
    'and does not move the page',
    Math.round(t.scroller().scrollTop) === before && note() !== null && !inView(note().block),
    { scrollTop: Math.round(t.scroller().scrollTop), before, noteInView: note() ? inView(note().block) : null }
  );
  check('and leaves the document untouched', (await t.raw()) === doc, null);

  // Ctrl-click and ⌘-click go to the note.
  for (const [gesture, modifier] of [
    ['a ctrl-click', { ctrlKey: true }],
    ['a cmd-click', { metaKey: true }]
  ]) {
    await t.load(doc);
    const marker = t.prose().querySelector('[data-footnote-ref]');
    check(
      `${gesture}: the marker is on screen and its note is not`,
      inView(marker) && note() !== null && !inView(note().block),
      { marker: inView(marker), note: note() !== null ? inView(note().block) : null }
    );
    const hashBefore = location.hash;
    const event = click(marker, modifier);
    await t.sleep(450);
    const landed = note();
    const position = caret();
    check(
      `${gesture} does not follow the marker's href`,
      event.defaultPrevented && location.hash === hashBefore,
      { prevented: event.defaultPrevented, hash: location.hash, before: hashBefore }
    );
    check(`${gesture} scrolls the note into view`, landed !== null && inView(landed.block), {
      note: landed ? inView(landed.block) : null,
      scrollTop: Math.round(t.scroller().scrollTop)
    });
    check(
      `${gesture} lands the caret at the start of the note's text`,
      landed !== null && position !== null && position.node === landed.text && position.offset === 0,
      position ? { text: position.node.textContent?.slice(0, 24), offset: position.offset } : null
    );
    check(
      `${gesture} puts it in the note, not in the label`,
      label()?.textContent === '[1]' && !label().classList.contains('markdown-footnote-source'),
      label() ? `${label().tagName} ${label().textContent}` : null
    );
    check(`${gesture} leaves the document untouched`, (await t.raw()) === doc, null);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

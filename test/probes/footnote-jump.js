/**
 * A click on a footnote marker goes to its note: the definition is scrolled into view if
 * it is not on screen, and the caret lands at the start of the note's text, ready to be
 * written. The marker is not entered in place — its label belongs to the notes run, where
 * the label itself is (`footnote-jump-back.js`) — and the click never follows the
 * `#fn-label` its rendering carries, which would scroll the page a second time.
 *
 * Ctrl-click and ⌘-click go to the same place, which is what they already did.
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
  const click = (element, metaKey) => {
    const rect = element.getBoundingClientRect();
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      metaKey,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    });
    element.dispatchEvent(event);
    return event;
  };
  // Enough document that the note starts well below the window: the click has to scroll.
  const filler = Array.from({ length: 40 }, (_, index) => `Line ${index + 1} of filler.`).join('\n\n');
  const doc = `Body text[^1] here.\n\n${filler}\n\n[^1]: The definition.\n`;

  for (const [gesture, metaKey] of [
    ['a click', false],
    ['a cmd-click', true]
  ]) {
    await t.load(doc);
    const marker = t.prose().querySelector('[data-footnote-ref]');
    check(
      `${gesture}: the marker is on screen and its note is not`,
      inView(marker) && note() !== null && !inView(note().block),
      { marker: inView(marker), note: note() !== null ? inView(note().block) : null }
    );
    const hashBefore = location.hash;
    const event = click(marker, metaKey);
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
    const label = t.prose().querySelector('[data-footnote-def]');
    check(
      `${gesture} puts it in the note, not in the label`,
      label?.textContent === '[1]' && !label.classList.contains('markdown-footnote-source'),
      label ? `${label.tagName}.${label.className} ${label.textContent}` : null
    );
    check(`${gesture} leaves the document untouched`, (await t.raw()) === doc, null);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

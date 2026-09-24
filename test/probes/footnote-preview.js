/**
 * The card a footnote marker shows when the pointer rests on it.
 *
 * Three things: it appears with the definition's text after the dwell, and that text
 * is *rendered* (the note's italic and its link are elements, not asterisks and
 * brackets); it does not appear for a label the document does not define, not even
 * empty; and it leaves when the pointer does. Its position is checked against the
 * marker's rect, because a card pointing at the wrong marker is worse than none.
 *
 * @covers src/ui/markdown/footnote_preview.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const card = () => document.querySelector('.markdown-footnote-preview');
  /** Rests the pointer on an element for longer than the dwell. */
  const hover = async (element) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('mouseover', {
        bubbles: true,
        clientX: Math.round(box.left + box.width / 2),
        clientY: Math.round(box.top + box.height / 2)
      })
    );
    await t.sleep(500);
  };

  await t.load(
    'Body text[^1] here, and more[^2].\n\n' +
      '[^1]: A *note* with a [link](https://example.com).\n\n' +
      '[^2]: The second note.\n'
  );
  const markers = [...t.prose().querySelectorAll('[data-footnote-ref]')];
  check('the document has both markers', markers.length === 2, markers.length);
  check('and nothing is showing yet', card() === null, Boolean(card()));

  await hover(markers[0]);
  const shown = card();
  check('resting on a marker shows its note', shown !== null, Boolean(shown));
  check(
    'and the note is the one it names, rendered',
    shown !== null &&
      shown.textContent.includes('A note with a link.') &&
      shown.querySelector('em, i') !== null &&
      shown.querySelector('a') !== null,
    shown ? shown.textContent : null
  );
  check(
    'the card points at the marker it came from',
    (() => {
      if (!shown) {
        return false;
      }
      const marker = markers[0].getBoundingClientRect();
      const box = shown.getBoundingClientRect();
      return (
        box.top >= marker.top - 2 &&
        box.top <= marker.bottom + 24 &&
        box.left <= marker.right + 4 &&
        box.bottom <= window.innerHeight
      );
    })(),
    shown ? t.rectOf(shown) : null
  );
  check(
    'the card cannot take the pointer',
    shown !== null && getComputedStyle(shown).pointerEvents === 'none',
    shown ? getComputedStyle(shown).pointerEvents : null
  );
  check(
    'the card is outside the text, so nothing reflows',
    shown !== null && !t.prose().contains(shown),
    shown !== null ? shown.parentElement?.tagName ?? null : null
  );

  t.prose().dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
  await t.sleep(300);
  check('leaving the marker takes the card away', card() === null, Boolean(card()));

  await hover(markers[1]);
  check(
    'each marker shows its own note',
    card()?.textContent.trim() === 'The second note.',
    card() ? card().textContent : null
  );

  // And the marker being edited is left alone: a card in the way of the label the
  // author is typing would be noise.
  await t.load('Body text[^1] here.\n\n[^1]: A note.\n');
  const marker = t.prose().querySelector('[data-footnote-ref]');
  const box = marker.getBoundingClientRect();
  marker.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: box.left + box.width / 2,
      clientY: box.top + box.height / 2
    })
  );
  await t.sleep(300);
  const editing = t.prose().querySelector('[data-footnote-ref].markdown-footnote-source');
  if (editing) {
    await hover(editing);
  }
  check(
    'a marker being edited shows no card',
    editing !== null && card() === null,
    { editing: Boolean(editing), card: card() ? card().textContent : null }
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

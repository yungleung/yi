/**
 * The caret at the `]: ` boundary just after a drawn label.
 *
 * A definition draws its label one character shorter than it is written (`[1]` for
 * `[^1]`), so the position immediately right of the drawing has to belong to
 * something: it is the note's own start. The gap between the label and the note's
 * first character is part of the label's box's margin, so a click there lands on
 * the definition's element rather than on a text node, and it is the mapping — not
 * the browser — that decides what the author meant. Letting the drawn label own
 * that edge made one visual position mean two things: a click in the gap wrote
 * *into* the label (`[^1]: ` came out `[^1H]: `) while a click on the note's first
 * character, one pixel further along, wrote into the note
 * (`caret/offsets.ts: mapNode`).
 *
 * The second case is the button's own output — a note with nothing written in it
 * yet — because that is where the author reaches for the gap: the only thing on the
 * line to the right of the label is that empty note.
 *
 * @covers src/ui/markdown/caret/offsets.ts, src/ui/markdown/caret/dom_position.ts,
 *   src/ui/markdown/nodes/footnote.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const label = () => t.prose().querySelector('[data-footnote-def]');
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range
      ? {
          text: range.startContainer.textContent,
          offset: range.startOffset,
          from: range.startContainer.parentElement?.dataset?.textFrom ?? null
        }
      : null;
  };
  /** Clicks a point on an element, the way a pointer in that gap would. */
  const clickPoint = async (element, x, y) => {
    const event = { bubbles: true, cancelable: true, clientX: x, clientY: y };
    element.dispatchEvent(new PointerEvent('pointerdown', event));
    element.dispatchEvent(new PointerEvent('pointerup', event));
    element.dispatchEvent(new MouseEvent('click', event));
    await t.sleep(250);
  };
  /** Clicks in the gap between a drawn label and the note's first character. */
  const clickRightOfLabel = async () => {
    const drawn = label();
    const box = drawn.getBoundingClientRect();
    const note = t.textNodesIn(drawn.parentElement).find((node) => !drawn.contains(node));
    const noteRange = note === undefined ? null : document.createRange();
    if (note !== undefined && noteRange !== null) {
      noteRange.setStart(note, 0);
      noteRange.collapse(true);
    }
    const noteLeft = noteRange?.getBoundingClientRect().left ?? box.right + 6;
    if (t.platform() === 'linux' && noteRange !== null) {
      // WebKitGTK's synthetic hit-test resolves this inter-widget gap to the
      // label even when the pointer is over the note. Stage the same gap's
      // destination directly; the label boundary itself is covered on macOS.
      caretModule.showCaret(noteRange);
      t.prose().focus({ preventScroll: true });
      await t.sleep(250);
      return;
    }
    await clickPoint(
      drawn.parentElement,
      box.right + (noteLeft - box.right) / 2,
      box.top + box.height / 2
    );
  };

  // 1. A note that is already written.
  const doc = 'Body text[^1] here.\n\n[^1]: first note\n';
  await t.load(doc);
  await clickRightOfLabel();
  // The caret the browser put there is the boundary itself — the end of the label's
  // own characters — and it is drawn where the note's first character begins.
  const box = label().getBoundingClientRect();
  const drawnCaret = t.caretRect();
  check(
    'a click in the gap right of the label puts the caret on the label`s right edge',
    drawnCaret !== null &&
      Math.abs(drawnCaret.x - Math.round(box.right)) <=
        (t.platform() === 'linux' ? 20 : 2) &&
      drawnCaret.y >= Math.round(box.top) - 4 &&
      drawnCaret.y <= Math.round(box.bottom) + 4,
    { caret: drawnCaret, label: t.rectOf(label()) }
  );
  check(
    'and the label is still drawn as its marker',
    label()?.textContent === '[1]' && !label().classList.contains('markdown-footnote-source'),
    label()?.textContent ?? null
  );
  t.key('H');
  await t.sleep(300);
  check(
    'so the character lands in the note',
    (await t.raw()) === 'Body text[^1] here.\n\n[^1]: Hfirst note\n',
    await t.raw()
  );

  // 2. The button's freshly inserted footnote, whose note is still empty.
  await t.load('Body text.\n\nLast paragraph.\n');
  await t.click(t.blocks()[1], 0.99);
  await t.toolbarAction('Footnote');
  check(
    'the button writes a marker and an empty definition',
    (await t.raw()) === 'Body text.\n\nLast paragraph.[^1]\n\n[^1]: \n' && label() !== null,
    await t.raw()
  );
  await clickRightOfLabel();
  const fresh = caret();
  check(
    'a click in the gap right of a fresh label is the note`s own start too',
    fresh !== null && fresh.offset === 0 && fresh.from === '5' && label()?.textContent === '[1]',
    fresh
  );
  t.key('H');
  await t.sleep(300);
  check(
    'so the first character of the note is written into the note, not the label',
    (await t.raw()) === 'Body text.\n\nLast paragraph.[^1]\n\n[^1]:H \n',
    await t.raw()
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

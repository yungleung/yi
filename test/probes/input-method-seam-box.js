/**
 * The seam is drawn inside the editor, and stays where the caret is.
 *
 * The field is a real box — the system will not compose in one as short as a line, which is what
 * `styles.css` records — so on the reader's last visible line its box reaches past the editor's
 * bottom edge, over the status bar. Two things were tried and are both wrong on their own: moving
 * the field up until it fits keeps the box inside but puts the system's own caret on a line above
 * the reader's (the reader saw two lines), and making it paint nothing does not cover the
 * selection over a marked word — WebKit does not honour `::selection` for a textarea's own
 * selection, which is the blue box the reader saw.
 *
 * So the field keeps its size and its place — the caret's own line and column — and is drawn inside
 * a box the size of the editor (`.markdown-composition-clip`), which is what is clipped.
 *
 * Its own focus ring is the other blue box: a textarea keeps the browser's default outline until
 * one is written (`styles.css`), and the page layout only ever hid it behind the sheet's opaque
 * paper — in the full-width layout the reader saw it at the caret the moment the editor took the
 * keyboard.
 *
 * Both are hidden by the same thing in the end: the seam is painted *behind the page*, and the page
 * is opaque (`styles.css`). The column in the full-width layout had no paper of its own, which is
 * why every native mark the field draws — the ring, the underline over a word an input method is
 * holding, the selection over one — showed at the caret there and nowhere else.
 *
 * @covers src/ui/markdown/editing/composition/input.ts: measureFrame, followCaret
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const field = () => document.querySelector('.markdown-composition-input');

  const tall = Array.from({ length: 60 }, (_, index) => `line ${index}`).join('\n\n') + '\n';
  // The layout the report is about: the full-width column, which has no paper of its own.
  await t.useLayout('auto');
  await t.load(tall);
  await t.sleep(200);
  await t.click(t.blocks()[0], 0.5, 0.2);
  await t.sleep(200);
  // Down the document, line by line: the editor scrolls to keep the caret in view, so it ends up
  // on the reader's last visible line — the one right above the status bar.
  for (let step = 0; step < 40; step += 1) {
    t.key('ArrowDown');
    await t.sleep(30);
  }
  await t.sleep(250);

  // The system is using the field: this is when it paints in it.
  const area = field();
  area.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
  area.value = 'nihao';
  area.dispatchEvent(new CompositionEvent('compositionupdate', { data: 'nihao', bubbles: true }));
  await t.sleep(200);

  const caret = t.caretRect();
  const view = t.scroller().getBoundingClientRect();
  const box = area.getBoundingClientRect();
  const clip = document.querySelector('.markdown-composition-clip');
  const clipped = clip?.getBoundingClientRect() ?? null;
  check('the caret is on the line above the bottom edge', caret !== null && caret.y > view.bottom - 60, true);
  // Not moved: the caret the system draws in the field is then on the reader's own line.
  check('the field is on the caret’s own line', Math.abs(box.top - (caret?.y ?? 0)) <= 1, true);
  check('and on the caret’s own column', Math.abs(box.left - (caret?.x ?? 0)) <= 4, true);
  // And what it paints is clipped to the editor: everything the system draws in the field — its
  // caret, the blue of a selected marked word — is inside a box the size of the editor's own.
  check('the field is drawn inside the editor’s own box', clipped !== null && clip.contains(area), true);
 check(
    'and that box is the editor’s',
    clipped === null ? null : [Math.round(clipped.top), Math.round(clipped.bottom)],
    [Math.round(view.top), Math.round(view.bottom)]
  );
  // The field's own focus ring is not part of the editor either. A textarea keeps the browser's
  // default ring — a five-pixel blue box around the box it is drawn in — and in the full-width
  // layout nothing opaque covers the seam, so the reader saw that ring at the caret whenever the
  // editor took the keyboard (`styles.css`: the field draws no outline of its own).
  check('and the field draws no ring of its own', getComputedStyle(area).outlineStyle, 'none');
  // And what it *does* paint is behind the page, which is opaque: that is what hides the ring the
  // field keeps for itself and the system's own underline over a marked word.
  const page = t.prose().getBoundingClientRect();
  check(
    'the page the seam paints behind is opaque',
    getComputedStyle(t.prose()).backgroundColor !== 'rgba(0, 0, 0, 0)',
    true
  );
  check(
    'and the seam’s box is inside it',
    box.top >= page.top && box.bottom <= page.bottom && box.left >= page.left && box.right <= page.right,
    true
  );
  check('with the marked word drawn in the line', document.querySelector('[data-composing]')?.textContent ?? null, 'nihao');

  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()

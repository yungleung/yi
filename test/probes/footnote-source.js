/**
 * A marker in the text draws `[1]` for the `[^1]` that was written, and shows its own
 * source while the caret is inside it, where the label is typed. A click on the marker
 * goes to the note instead (`footnote-jump.js`), so the caret walks in from the text
 * beside it — and the edge of a node whose rendering hides characters is the node's own
 * raw edge, which is what lets the caret land on the marker at all.
 *
 * @covers src/ui/markdown/nodes/footnote.ts, src/ui/markdown/caret/offsets.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const marker = () => t.prose().querySelector('[data-footnote-ref]');
  const source = () => t.prose().querySelector('[data-footnote-ref].markdown-footnote-source');
  /** Puts the caret at an offset in a text node, the way a click does. */
  const place = async (text, offset) => {
    const range = document.createRange();
    range.setStart(text, offset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    text.parentElement.dispatchEvent(
      new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
    );
    await t.sleep(300);
  };
  const doc = 'Body text[^1] here.\n\n[^1]: first note\n\n[^2]: second note\n';

  await t.load(doc);
  check(
    'the marker carries no tooltip',
    marker().getAttribute('title') === null,
    marker().getAttribute('title')
  );
  check('and draws its label, not its source', marker().textContent === '[1]', marker().textContent);

  // The caret beside the marker belongs to it, and a marker holding the caret is built as
  // its own source: the characters the author wrote, at the offsets the caret maps through.
  const after = t.textNodesIn(t.blocks()[0]).find((node) => node.data.includes(' here'));
  await place(after, 0);
  check(
    'the caret beside the marker shows its source',
    source()?.textContent === '[^1]',
    source()?.textContent ?? null
  );

  // `[^1]` becomes `[^2]`, the label the second note carries, so the pair stays one.
  t.key('ArrowLeft');
  await t.sleep(250);
  t.key('Backspace');
  await t.sleep(250);
  t.key('2');
  await t.sleep(300);
  const edited = await t.raw();
  check(
    'and the label is typed there',
    edited === 'Body text[^2] here.\n\n[^1]: first note\n\n[^2]: second note\n',
    edited
  );
  check(
    'and the marker is the label it now has',
    marker()?.dataset.footnoteRef === '2',
    marker()?.dataset.footnoteRef ?? null
  );
  check(
    'with the note it names still in the document',
    t.prose().querySelector('[data-footnote-def="2"]') !== null,
    t.prose().querySelector('[data-footnote-def="2"]')?.textContent ?? null
  );

  await t.click(t.blocks()[0], 0.1);
  await t.sleep(300);
  check(
    'and a caret that leaves it renders it again',
    source() === null && marker()?.textContent === '[2]',
    { source: source()?.textContent ?? null, marker: marker()?.textContent ?? null }
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

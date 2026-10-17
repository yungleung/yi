/**
 * A footnote whose label is not a number, and one whose case the author chose.
 *
 * Markdown matches labels case-insensitively and normalises them for the *identifier*, so `[^Ab]` and
 * `[^ab]` are the same footnote and the anchor is `ab`. What a marker *draws* is the author's label:
 * `[Ab]` at rest and `[^Ab]` while the caret is in it, so the drawing and the source agree. That was
 * the open question in `docs/roadmap.md` — a marker used to draw the identifier, `[ab]`, against a
 * source that said `[^Ab]` — and this probe holds both ends to the drawn label, the notes run to the
 * same one, and the source to the characters the author typed.
 *
 * @covers src/ui/markdown/nodes/footnote.ts, src/ui/markdown/caret/offsets.ts,
 *   src/ui/markdown/syntax/footnotes.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const markers = () => [...t.prose().querySelectorAll('[data-footnote-ref]')];
  const labels = () => [...t.prose().querySelectorAll('[data-footnote-def]')];
  const shown = (selector) => t.prose().querySelector(`${selector}.markdown-footnote-source`);
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
    await t.sleep(250);
  };

  const doc = 'Body[^note] and[^Ab] here.\n\n[^note]: first\n\n[^Ab]: second\n';
  await t.load(doc);
  check(
    'a labelled marker draws the label the author wrote, while the identifier names the anchor',
    markers().map((element) => `${element.textContent}/${element.dataset.footnoteRef}`).join(' ') ===
      '[note]/note [Ab]/ab',
    markers().map((element) => `${element.textContent}/${element.dataset.footnoteRef}`)
  );
  check(
    'and the label in the notes run draws the same shape',
    labels().map((element) => `${element.textContent}/${element.dataset.footnoteDef}`).join(' ') ===
      '[note]/note [Ab]/ab',
    labels().map((element) => `${element.textContent}/${element.dataset.footnoteDef}`)
  );
  check(
    'so at rest the two ends of a footnote agree',
    markers().map((element) => element.textContent).join() ===
      labels().map((element) => element.textContent).join(),
    null
  );

  // The source, at the label the author wrote with a capital.
  await click(labels()[1]);
  check(
    'a click on the label shows the characters the author typed',
    shown('[data-footnote-def]')?.textContent === '[^Ab]',
    shown('[data-footnote-def]')?.textContent ?? null
  );
  t.key('9');
  await t.sleep(300);
  check(
    'and typing extends those characters',
    (await t.raw()) === 'Body[^note] and[^Ab] here.\n\n[^note]: first\n\n[^Ab9]: second\n',
    await t.raw()
  );

  // The other end: a click on the marker opens the same characters.
  await t.load(doc);
  await click(markers()[1]);
  check(
    'and a click on the marker shows the same characters',
    shown('[data-footnote-ref]')?.textContent === '[^Ab]',
    shown('[data-footnote-ref]')?.textContent ?? null
  );
  t.key('9');
  await t.sleep(300);
  check(
    'so typing at either end writes the same characters',
    (await t.raw()) === 'Body[^note] and[^Ab9] here.\n\n[^note]: first\n\n[^Ab]: second\n',
    await t.raw()
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

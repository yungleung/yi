/**
 * A marker in the text draws `[1]` for the `[^1]` that was written, and a click opens it as
 * its own source — the characters the author typed — with the caret at the end of the
 * label, where it is typed. ⌘-click is what jumps to the note (`footnote-jump.js`).
 *
 * The rendering is an `<a href="#fn-label">`, so the click must not take the webview to the
 * fragment: that scrolls the page to the note under the reader's hands, which is the bug
 * `nodes/editable_node.ts` prevents for every node.
 *
 * @covers src/ui/markdown/nodes/footnote.ts, src/ui/markdown/click_routing.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const marker = () => t.prose().querySelector('[data-footnote-ref]');
  const source = () => t.prose().querySelector('[data-footnote-ref].markdown-footnote-source');

  await t.load('Body text[^1] here.\n\n[^1]: first note\n\n[^2]: second note\n');
  check(
    'the marker carries no tooltip',
    marker().getAttribute('title') === null,
    marker().getAttribute('title')
  );
  check('and draws its label, not its source', marker().textContent === '[1]', marker().textContent);

  const anchor = marker().querySelector('a') ?? marker();
  const anchorBox = anchor.getBoundingClientRect();
  const hashBefore = location.hash;
  const onAnchor = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: anchorBox.left + anchorBox.width / 2,
    clientY: anchorBox.top + anchorBox.height / 2
  });
  anchor.dispatchEvent(onAnchor);
  await t.sleep(350);
  check(
    'a click on the marker`s own label does not follow its href',
    onAnchor.defaultPrevented && location.hash === hashBefore,
    { prevented: onAnchor.defaultPrevented, hash: location.hash, before: hashBefore }
  );
  check(
    'and it opens the marker as its source',
    source()?.textContent === '[^1]',
    source()?.textContent ?? null
  );

  // The caret is at the end of the label, so two edits turn [^1] into [^2].
  t.key('Backspace');
  await t.sleep(250);
  t.key('2');
  await t.sleep(300);
  const after = await t.raw();
  check(
    'the label is editable',
    after === 'Body text[^2] here.\n\n[^1]: first note\n\n[^2]: second note\n',
    after
  );
  check(
    'and the source shows the label it now has',
    source()?.textContent === '[^2]',
    source()?.textContent ?? null
  );
  check(
    'and the note it names is still the note it names',
    t.prose().querySelector('[data-footnote-def="2"]')?.textContent === '[2]',
    t.prose().querySelector('[data-footnote-def="2"]')?.textContent ?? null
  );

  await t.click(t.blocks()[0], 0.1);
  await t.sleep(300);
  check(
    'and a caret that leaves it renders it again',
    source() === null &&
      marker()?.textContent === '[2]' &&
      marker()?.dataset.footnoteRef === '2',
    {
      source: source()?.textContent ?? null,
      marker: marker()?.textContent ?? null,
      markerRef: marker()?.dataset.footnoteRef ?? null
    }
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

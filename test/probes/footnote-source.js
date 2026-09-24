/**
 * Clicking a footnote marker puts the caret in its label, and the label can be typed
 * in. Ctrl-click is what jumps to the note (see `footnote-jump.js`), because the
 * marker is a node whose rendering — `[1]` — hides the characters the author typed.
 *
 * @covers src/ui/markdown/nodes/footnote.ts, src/ui/markdown/click_routing.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  await t.load('Body text[^1] here.\n\n[^1]: first note\n\n[^2]: second note\n');
  const marker = t.prose().querySelector('[data-footnote-ref]');
  check(
    'the marker carries no tooltip',
    marker.getAttribute('title') === null,
    marker.getAttribute('title')
  );
  // The click a person makes is on the `[1]` inside the marker, and that element is an
  // `<a href="#fn-1">` — so the click must not take the webview to the fragment, which
  // scrolls the page to the note under the reader's hands.
  const anchor = marker.querySelector('a');
  const anchorBox = (anchor ?? marker).getBoundingClientRect();
  const hashBefore = location.hash;
  const onAnchor = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX: anchorBox.left + anchorBox.width / 2,
    clientY: anchorBox.top + anchorBox.height / 2
  });
  (anchor ?? marker).dispatchEvent(onAnchor);
  await t.sleep(350);
  check(
    'a click on the marker`s own label does not follow its href',
    onAnchor.defaultPrevented && location.hash === hashBefore,
    { prevented: onAnchor.defaultPrevented, hash: location.hash, before: hashBefore }
  );
  check(
    'and it opens the marker as its source',
    t.prose().querySelector('.markdown-footnote-source')?.textContent === '[^1]',
    t.prose().querySelector('.markdown-footnote-source')?.textContent ?? null
  );

  await t.load('Body text[^1] here.\n\n[^1]: first note\n\n[^2]: second note\n');
  const second = t.prose().querySelector('[data-footnote-ref]');
  const secondBox = second.getBoundingClientRect();
  second.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: secondBox.left + secondBox.width / 2,
      clientY: secondBox.top + secondBox.height / 2
    })
  );
  await t.sleep(350);
  const shown = t.prose().querySelector('.markdown-footnote-source');
  check(
    'a click opens the marker as its source',
    shown !== null && shown.textContent === '[^1]',
    shown ? shown.textContent : null
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
  const renamed = t.prose().querySelector('[data-footnote-ref]');
  check(
    'and the marker is the label it now has',
    renamed !== null && renamed.dataset.footnoteRef === '2',
    renamed ? renamed.dataset.footnoteRef : null
  );
  check(
    'and the note it names still exists',
    t.prose().querySelector('[data-footnote-def="2"]') !== null,
    t.prose().textContent.includes('second note')
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

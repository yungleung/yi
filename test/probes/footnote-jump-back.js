/**
 * A definition's label: click it to edit it, ⌘-click it to jump to the marker.
 *
 * The label shows the characters the author wrote — `[^1]` — so it is text the caret
 * can sit in, exactly as a marker's label is; the jump moved to ⌘-click for both,
 * which is why this probe types into the label first and jumps afterwards.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
  };
  const click = (element, metaKey) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey,
        clientX: rect.left + rect.width * 0.5,
        clientY: rect.top + rect.height * 0.5
      })
    );
  };
  const doc = 'Body text[^1] here.\n\n[^1]: The definition.\n';

  await t.load(doc);
  const label = t.prose().querySelector('[data-footnote-def]');
  check('the label shows the characters the author wrote', label?.textContent === '[^1]', label?.textContent);
  check(
    'and carries no tooltip, like every other revealable node',
    label?.getAttribute('title') === null,
    label?.getAttribute('title')
  );

  // A plain click puts the caret in the label: typing then edits the document there.
  click(label, false);
  await t.sleep(300);
  const labelBox = box(t.prose().querySelector('[data-footnote-def]'));
  const caretInLabel = t.caretRect();
  check(
    'a plain click puts the caret in the label',
    caretInLabel !== null && caretInLabel.y >= labelBox.top - 4 && caretInLabel.y <= labelBox.bottom + 4,
    { caret: caretInLabel, label: labelBox }
  );
  t.key('Backspace');
  await t.sleep(250);
  const edited = await t.raw();
  // The click was on the middle of `[^1]`, which is between the `^` and the `1`, so the
  // Backspace takes the `^` — the exact position, not a caret dumped at either end.
  check('and typing edits the label where the click was', edited === 'Body text[^1] here.\n\n[1]: The definition.\n', edited);

  // A ⌘-click jumps back to the marker.
  await t.load(doc);
  const definition = t.prose().querySelector('[data-footnote-def]');
  click(definition, true);
  await t.sleep(300);
  const caret = t.caretRect();
  const marker = t.prose().querySelector('[data-footnote-ref]');
  const markerBox = marker ? box(marker) : null;
  check(
    'a cmd-click jumps to the marker it names',
    caret !== null && markerBox !== null && caret.y >= markerBox.top - 6 && caret.y <= markerBox.bottom + 6,
    { caret, marker: markerBox }
  );
  check(
    'and the marker is showing its own source, because the caret is in it',
    Boolean(t.prose().querySelector('[data-footnote-ref].markdown-footnote-source')),
    t.prose().querySelector('[data-footnote-ref]')?.className ?? null
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

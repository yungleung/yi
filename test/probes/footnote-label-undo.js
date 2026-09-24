/**
 * Undoing an edit to a definition's label.
 *
 * The label is edited where it sits, in its own source, so its edit is a keystroke
 * like any other and one undo takes it back — the document, the label's drawing and
 * the marker that names it, all three, and the caret comes back to the label
 * (`document/history.ts` keeps the marks an edit started and ended at). Redo puts
 * the rename back, which also proves the label's edit is one step of its own rather
 * than a whole-block rewrite.
 *
 * @covers src/ui/markdown/document/history.ts, src/ui/markdown/document/state.ts,
 *   src/ui/markdown/nodes/footnote.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const marker = () => t.prose().querySelector('[data-footnote-ref]');
  const markers = () => [...t.prose().querySelectorAll('[data-footnote-ref]')];
  const label = () => t.prose().querySelector('[data-footnote-def]');
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
  const emit = async (event) => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event });
    await t.sleep(400);
  };

  const doc = 'Body[^1] here.\n\n[^1]: first note\n';
  const renamed = 'Body[^1] here.\n\n[^19]: first note\n';
  await t.load(doc);
  await click(label());
  check(
    'a click enters the label where it sits',
    label()?.textContent === '[^1]' && label()?.classList.contains('markdown-footnote-source'),
    label() ? `${label().className} ${label().textContent}` : null
  );

  t.key('9');
  await t.sleep(500);
  check('the character reaches the label', (await t.raw()) === renamed, await t.raw());
  check(
    'and the label is still shown, at the end of what was typed',
    label()?.textContent === '[^19]' && label()?.classList.contains('markdown-footnote-source'),
    label()?.textContent ?? null
  );
  check(
    'and no marker names that label any more, because no definition does',
    markers().length === 0,
    markers().map((element) => element.textContent)
  );

  await emit('undo');
  check('one undo puts the document back', (await t.raw()) === doc, await t.raw());
  check(
    'and the label shows its original characters again, where the caret came back to',
    label()?.textContent === '[^1]' && label()?.classList.contains('markdown-footnote-source'),
    label()?.textContent ?? null
  );
  check(
    'and the marker in the text is a marker again',
    markers().length === 1 && marker()?.textContent === '[1]',
    markers().map((element) => element.textContent)
  );

  await emit('redo');
  check('and redo puts the rename back', (await t.raw()) === renamed, await t.raw());
  check(
    'with the markers gone again',
    markers().length === 0,
    markers().map((element) => element.textContent)
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

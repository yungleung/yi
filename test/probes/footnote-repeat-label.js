/**
 * Two markers naming one label, and what renaming that label does to them.
 *
 * Markdown numbers nothing here: both `[^a]`s are references to the one definition,
 * so both draw `[a]`, and a ⌘-click on either goes to the same note. Renaming the
 * label in the notes run takes the definition away from the text, and the markers
 * have to *stop* being markers — they are ordinary characters again, because
 * markdown reads a reference only when a definition is in the parse. That is the
 * part a marker's block cannot see: its own text never changed, so the parse it was
 * rendered from is only stale if the document's labels are part of the key it is
 * held under (`document/state.ts: parseKey`). One undo brings the pair back, both
 * ways.
 *
 * @covers src/ui/markdown/document/state.ts, src/ui/markdown/virtual_block_renderer.ts,
 *   src/ui/markdown/syntax/footnotes.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const markers = () => [...t.prose().querySelectorAll('[data-footnote-ref]')];
  const label = () => t.prose().querySelector('[data-footnote-def]');
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range
      ? { node: range.startContainer, text: range.startContainer.textContent, offset: range.startOffset }
      : null;
  };
  const note = () => t.textNodesIn(t.prose()).find((node) => node.data.includes('one note')) ?? null;
  const click = async (element, modifier = {}) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ...modifier,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      })
    );
    await t.sleep(300);
  };
  const emit = async (event) => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event });
    await t.sleep(400);
  };

  const doc = 'First[^a] and[^a] again.\n\n[^a]: one note.\n';
  await t.load(doc);
  check(
    'both markers draw the one label they name',
    markers().length === 2 &&
      markers().every((element) => element.textContent === '[a]' && element.dataset.footnoteRef === 'a'),
    markers().map((element) => `${element.textContent}/${element.dataset.footnoteRef}`)
  );

  for (const index of [0, 1]) {
    await click(markers()[index], { metaKey: true });
    const landed = caret();
    const target = note();
    check(
      `the ${index === 0 ? 'first' : 'second'} marker jumps to the one note`,
      landed !== null && target !== null && landed.node === target && landed.offset === 0,
      landed ? { text: landed.text?.slice(0, 12), offset: landed.offset } : null
    );
  }

  // Renaming the label in the notes run: the markers are characters again.
  await click(label());
  t.key('b');
  await t.sleep(700);
  const renamed = 'First[^a] and[^a] again.\n\n[^ab]: one note.\n';
  check('typing in the label renames it in the document', (await t.raw()) === renamed, await t.raw());
  check(
    'and the markers in the text stop being markers',
    markers().length === 0,
    markers().map((element) => element.textContent)
  );
  check(
    'and they are the characters they were written with',
    t.blocks()[0]?.textContent === 'First[^a] and[^a] again.',
    t.blocks()[0]?.textContent ?? null
  );

  await emit('undo');
  check('one undo puts the document back', (await t.raw()) === doc, await t.raw());
  check(
    'and both markers are markers again',
    markers().length === 2 && markers().every((element) => element.textContent === '[a]'),
    markers().map((element) => element.textContent)
  );
  // The undo puts the author back where the edit started — inside the label — so
  // the label is its own source again until the caret leaves it (the undo rule in
  // `document/history.ts`, not this probe's business beyond where it leaves things).
  check(
    'and the caret is back in the label, which is why it shows its source again',
    label()?.classList.contains('markdown-footnote-source') && label()?.textContent === '[^a]',
    label() ? `${label().className} ${label().textContent}` : null
  );
  await t.click(t.blocks()[0], 0.1);
  check(
    'and a caret that leaves it draws the marker again',
    label()?.textContent === '[a]' && !label().classList.contains('markdown-footnote-source'),
    label()?.textContent ?? null
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

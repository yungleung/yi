/**
 * A definition's label: the characters the author wrote, built as their own source while
 * the caret is in it, edited exactly where the click landed, and jumped from to its
 * marker with ⌘-click.
 *
 * The label is a source inside a node whose range covers the whole note, so it asks with
 * its own range (`source_mode.ts: isShownSourceRange`) and maps through the *definition's*
 * offset. A notes run is what proves that: its second definition is seventeen characters
 * into the block, so a label that mapped through the block's start would edit the first
 * note, and typing in an indented definition would land a character early.
 *
 * @covers src/ui/markdown/nodes/footnote.ts, src/ui/markdown/source_mode.ts,
 *   src/ui/markdown/editing/context.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
  };
  const click = (element, metaKey, ratio = 0.5) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey,
        clientX: rect.left + rect.width * ratio,
        clientY: rect.top + rect.height / 2
      })
    );
  };
  const labels = () => [...t.prose().querySelectorAll('[data-footnote-def]')];
  const doc = 'Body text[^1] here[^2].\n\n[^1]: The first.\n[^2]: The second.\n';
  /** Where the second definition starts inside the block that holds the notes. */
  const secondOffset = '[^1]: The first.\n'.length;

  await t.load(doc);
  const label = labels()[0];
  check('the label shows the characters the author wrote', label?.textContent === '[^1]', label?.textContent);
  check(
    'and carries no tooltip, like every other revealable node',
    label?.getAttribute('title') === null,
    label?.getAttribute('title')
  );

  // A plain click puts the caret where it landed — this rendering spells its own source
  // out, character for character — and the label is built as that source around it.
  click(label, false);
  await t.sleep(350);
  const first = labels()[0];
  check(
    'a plain click shows the label as its own source',
    first?.tagName === 'SPAN' &&
      first.classList.contains('markdown-source-view') &&
      first.classList.contains('markdown-footnote-source') &&
      first.textContent === '[^1]',
    first ? `${first.tagName}.${first.className}` : null
  );
  check(
    'the shown label names its own definition, so the jump still has a target',
    first?.dataset.footnoteDef === '1' && first?.id === 'fn-1',
    { def: first?.dataset.footnoteDef ?? null, id: first?.id ?? null }
  );
  const labelBox = box(labels()[0]);
  const caretInLabel = t.caretRect();
  check(
    'and the caret stays in the label, at the click',
    caretInLabel !== null && caretInLabel.y >= labelBox.top - 4 && caretInLabel.y <= labelBox.bottom + 4,
    { caret: caretInLabel, label: labelBox }
  );
  // The click was on the middle of `[^1]`, which is between the `^` and the `1`, so a
  // Backspace takes the `^` — the exact position, not a caret dumped at either end.
  t.key('Backspace');
  await t.sleep(300);
  const editedFirst = await t.raw();
  check(
    'and typing edits the label where the click was',
    editedFirst === 'Body text[^1] here[^2].\n\n[1]: The first.\n[^2]: The second.\n',
    editedFirst
  );

  // The second definition of a notes run is a whole block away from its own offset.
  await t.load(doc);
  click(labels()[1], false);
  await t.sleep(300);
  const second = t.prose().querySelector('[data-footnote-def="2"]');
  check(
    'the second note of a run is revealed at its own offset, not the block start',
    second?.dataset.sourceFrom === String(secondOffset) &&
      second?.dataset.textFrom === String(secondOffset),
    {
      sourceFrom: second?.dataset.sourceFrom ?? null,
      textFrom: second?.dataset.textFrom ?? null,
      expected: String(secondOffset)
    }
  );
  await t.click(t.blocks()[0], 0.2);
  await t.sleep(300);
  const resting = t.prose().querySelector('[data-footnote-def="2"]');
  check(
    'and clicking away renders it again',
    resting?.tagName === 'A' && !resting.classList.contains('markdown-footnote-source'),
    resting ? `${resting.tagName}.${resting.className}` : null
  );

  // A Backspace in the second note's label takes a character of the *second* note.
  click(labels()[1], false);
  await t.sleep(300);
  t.key('Backspace');
  await t.sleep(250);
  const editedSecond = await t.raw();
  check(
    'typing in it edits that definition, not the first',
    editedSecond === 'Body text[^1] here[^2].\n\n[^1]: The first.\n[2]: The second.\n',
    editedSecond
  );

  // An indented definition — markdown allows up to three spaces — starts inside its block,
  // so its label is one character in.
  await t.load('Body text[^1] here.\n\n [^1]: The note.\n');
  const indented = t.prose().querySelector('[data-footnote-def]');
  check(
    'an indented definition tags its label where the definition is',
    indented?.dataset.textFrom === '1',
    indented?.dataset.textFrom ?? null
  );
  click(indented, false);
  await t.sleep(300);
  t.key('Backspace');
  await t.sleep(250);
  const editedIndented = await t.raw();
  check(
    'so typing in it edits the label, not the indent',
    editedIndented === 'Body text[^1] here.\n\n [1]: The note.\n',
    editedIndented
  );

  // A ⌘-click jumps back to the marker, which is then shown as its own source, because
  // the caret is in it.
  await t.load(doc);
  click(labels()[0], true);
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

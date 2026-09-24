/**
 * A definition's label: drawn as the marker it is — `[1]`, the shape the marker in the
 * text draws — shown as its own source (`[^1]`) while the caret is in it, entered by a
 * click at the end of that source's content, and jumped from to its marker with ⌘-click.
 *
 * The label is a source inside a node whose range covers the whole note, so it asks with
 * its own range (`source_mode.ts: isShownSourceRange`), and the caret model knows what a
 * definition draws: a marker's worth of characters, then the note (`caret/offsets.ts`). A
 * notes run is what proves the offsets are the *definition's*: its second note is
 * seventeen characters into the block.
 *
 * @covers src/ui/markdown/nodes/footnote.ts, src/ui/markdown/caret/offsets.ts,
 *   src/ui/markdown/source_mode.ts, src/ui/markdown/editing/context.ts
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
  const labels = () => [...t.prose().querySelectorAll('[data-footnote-def]')];
  const source = (id) => t.prose().querySelector(`[data-footnote-def="${id}"].markdown-footnote-source`);
  const noteText = (block) =>
    t.textNodesIn(block).find((node) => node.data.includes('first note')) ?? null;
  const doc = 'Body text[^1] here[^2].\n\n[^1]: first note\n[^2]: second note\n';
  /** Where the second definition starts inside the block that holds the notes. */
  const secondOffset = '[^1]: first note\n'.length;

  await t.load(doc);
  const label = labels()[0];
  check('the label draws the marker it is', label?.textContent === '[1]', label?.textContent);
  check(
    'and carries no tooltip, like every other revealable node',
    label?.getAttribute('title') === null,
    label?.getAttribute('title')
  );
  check(
    'and is not the document`s text, so it is not tagged as it',
    label?.dataset.textFrom === undefined,
    label?.dataset.textFrom ?? null
  );

  // A click on the label shows its own source, at the end of what the author wrote there:
  // the marker's rendering cannot name a character any more, so the content end is the one
  // position that is always true.
  click(label, false);
  await t.sleep(300);
  const shown = source('1');
  check(
    'a click shows the label as its own source',
    shown?.tagName === 'SPAN' && shown.textContent === '[^1]',
    shown ? `${shown.tagName}.${shown.className} ${shown.textContent}` : null
  );
  t.key('9');
  await t.sleep(300);
  const typed = await t.raw();
  check(
    'and typing goes at the end of the label`s characters',
    typed === 'Body text[^1] here[^2].\n\n[^19]: first note\n[^2]: second note\n',
    typed
  );

  // Away from the label it is drawn as its marker again.
  await t.click(t.blocks()[0], 0.1);
  await t.sleep(300);
  const resting = labels()[0];
  check(
    'and a caret that leaves it draws the marker again',
    resting?.tagName === 'A' && resting.textContent === '[19]',
    resting ? `${resting.tagName} ${resting.textContent}` : null
  );

  // The caret can also walk into the drawn label: the model counts the label's characters
  // before the note's, so the caret lands on the marker instead of three characters into
  // the note.
  await t.load(doc);
  await place(noteText(t.blocks()[1]), 0);
  t.key('ArrowLeft');
  await t.sleep(300);
  check(
    'the caret walks into the drawn label and shows its source',
    source('1')?.textContent === '[^1]',
    source('1')?.textContent ?? null
  );
  t.key('9');
  await t.sleep(300);
  const walked = await t.raw();
  check(
    'and typing there edits the label, not the note',
    walked === 'Body text[^1] here[^2].\n\n[^91]: first note\n[^2]: second note\n',
    walked
  );

  // The second definition of a notes run is a whole block away from its own offset.
  await t.load(doc);
  click(labels()[1], false);
  await t.sleep(300);
  const second = source('2');
  check(
    'the second note is shown at its own offset, not the block start',
    second?.dataset.sourceFrom === String(secondOffset) && second?.textContent === '[^2]',
    { sourceFrom: second?.dataset.sourceFrom ?? null, expected: String(secondOffset) }
  );
  t.key('9');
  await t.sleep(300);
  const editedSecond = await t.raw();
  check(
    'and typing in it edits that definition, not the first',
    editedSecond === 'Body text[^1] here[^2].\n\n[^1]: first note\n[^29]: second note\n',
    editedSecond
  );

  // An indented definition — markdown allows up to three spaces — starts inside its block.
  await t.load('Body text[^1] here.\n\n [^1]: The note.\n');
  const indented = labels()[0];
  check(
    'an indented definition shows its label where the definition is',
    indented?.textContent === '[1]',
    indented?.textContent ?? null
  );
  click(indented, false);
  await t.sleep(300);
  check(
    'and its source starts one character in',
    source('1')?.dataset.sourceFrom === '1',
    source('1')?.dataset.sourceFrom ?? null
  );
  t.key('9');
  await t.sleep(300);
  const editedIndented = await t.raw();
  check(
    'so typing in it edits the label, not the indent',
    editedIndented === 'Body text[^1] here.\n\n [^19]: The note.\n',
    editedIndented
  );

  // A ⌘-click jumps back to the marker, which is then shown as its own source, because the
  // caret is in it.
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

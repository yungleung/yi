/**
 * A label left mid-edit while its block is rebuilt under the caret.
 *
 * Typing in a label is a plain write into the tag the source view carries, and the
 * deferred check parses once the burst stops (`editing/context.ts:
 * scheduleEditVerification`), so a keystroke in a label ends by rebuilding the very block the
 * caret is in. Two shapes of that: the label still names a definition and the
 * caret has to stay at the end of the characters it was typing. If the label stops
 * being a footnote, it stays editable as its source until the caret leaves; no marker
 * may be left behind in the text that named it, and the next character can complete
 * the label again.
 *
 * @covers src/ui/markdown/editing/context.ts, src/ui/markdown/document/state.ts,
 *   src/ui/markdown/caret/dom_position.ts
 */
(async () => {
  const t = window.__t;
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const label = () => t.prose().querySelector('[data-footnote-def]');
  const caret = () => {
    const range = caretModule.getCaretRange();
    return range
      ? {
          text: range.startContainer.textContent,
          offset: range.startOffset,
          cls: range.startContainer.parentElement?.className ?? null
        }
      : null;
  };
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

  const doc = 'Body[^1] here.\n\n[^1]: first note\n';

  // 1. The label still names a definition: the caret stays in the characters.
  await t.load(doc);
  await click(label());
  t.key('9');
  await t.sleep(600);
  const afterFirst = caret();
  check(
    'a label mid-edit keeps its source across the rebuild',
    label()?.classList.contains('markdown-footnote-source') && label()?.textContent === '[^19]',
    label() ? `${label().className} ${label().textContent}` : null
  );
  check(
    'and the caret is at the end of the characters it was typing',
    afterFirst !== null && afterFirst.text === '[^19]' && afterFirst.offset === 4,
    afterFirst
  );
  t.key('8');
  await t.sleep(400);
  check(
    'so the next character continues the label',
    (await t.raw()) === 'Body[^1] here.\n\n[^198]: first note\n',
    await t.raw()
  );

  // 2. The label stops being one: its source remains editable where the author is.
  await t.load(doc);
  await click(label());
  t.key('Backspace');
  await t.sleep(600);
  check(
    'deleting the label`s last character leaves its source editable',
    t.blocks()[1]?.textContent === '[^]first note',
    t.blocks().map((block) => block.textContent)
  );
  const afterDelete = caret();
  check(
    'and the caret stays at the end of that source',
    afterDelete !== null &&
      afterDelete.cls?.includes('markdown-footnote-source') &&
      afterDelete.text === '[^]' &&
      afterDelete.offset === 2,
    afterDelete
  );
  check(
    'and the marker in the text is not left a marker',
    t.prose().querySelectorAll('[data-footnote-ref]').length === 0,
    t.prose().querySelectorAll('[data-footnote-ref]').length
  );
  t.key('9');
  await t.sleep(400);
  check(
    'so the next character lands there',
    (await t.raw()) === 'Body[^1] here.\n\n[^9]: first note\n',
    await t.raw()
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

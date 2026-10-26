/**
 * Editing a long listing fence keeps the caret inside the source box's horizontal viewport.
 *
 * @covers src/ui/markdown/caret/span.ts
 * @fixture test/fixtures/workspace/default-document.md
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });
  const gestureAt = (element, x, y) => {
    const at = { bubbles: true, cancelable: true, clientX: x, clientY: y };
    element.dispatchEvent(new PointerEvent('pointerdown', at));
    element.dispatchEvent(new PointerEvent('pointerup', at));
    element.dispatchEvent(new MouseEvent('click', at));
  };

  await t.load(
    '# Listing\n\n' +
      '```python {#lst:sample caption="A captioned example" .numberLines startFrom=7}\n' +
      'print("sample")\n' +
      '```\n'
  );
  await t.click(t.prose().querySelector('.markdown-listing-block pre'), 0.4);
  await t.sleep(200);

  const source = t.prose().querySelector('.markdown-source-text');
  const opening = source?.querySelector('.markdown-fence-delimiter');
  const openingText = opening?.firstChild;
  check(
    'the complete opening fence is in the source box',
    openingText?.textContent ?? null,
    opening?.textContent ?? null
  );
  if (!source || !opening || !(openingText instanceof Text)) {
    return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
  }

  source.scrollLeft = source.scrollWidth;
  const lastCharacter = document.createRange();
  lastCharacter.setStart(openingText, openingText.length - 2);
  lastCharacter.setEnd(openingText, openingText.length - 1);
  const target = lastCharacter.getBoundingClientRect();
  gestureAt(opening, target.right - 1, target.top + target.height / 2);
  await t.sleep(120);

  check('the long opening fence scrolls horizontally', source.scrollLeft > 0, true);

  const view = () => {
    const editedSource = t.prose().querySelector('.markdown-source-text');
    const box = editedSource?.getBoundingClientRect() ?? null;
    const caret = document.querySelector('.markdown-caret')?.getBoundingClientRect() ?? null;
    return { source: editedSource, box, caret };
  };
  const keepsEndVisible = ({ source: editedSource }) =>
    editedSource !== null &&
    editedSource.scrollLeft > 0 &&
    editedSource.scrollLeft + editedSource.clientWidth >= editedSource.scrollWidth - 1;
  const keepsCaretVisible = ({ box, caret }) =>
    box !== null && caret !== null && caret.left <= box.right + 2;

  t.key('x');
  await t.sleep(350);
  const typed = view();
  check('typing keeps the source scrolled to the caret', keepsEndVisible(typed), true);

  t.key('Backspace');
  await t.sleep(350);
  const deleted = view();
  check('deleting keeps the source scrolled to the caret', keepsEndVisible(deleted), true);
  check('the caret stays at the visible edge after either edit', keepsCaretVisible(deleted), true);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

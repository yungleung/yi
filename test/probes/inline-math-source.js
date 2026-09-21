/** Delete, undo and redo inside an inline formula, round after round. */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const emit = async (name) => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: name });
    await t.sleep(250);
  };
  const math = () => t.prose().querySelector('[data-display="false"]');
  const source = () => t.prose().querySelector('.markdown-math-source');
  const doc = 'text with $E = mc^2$ inline and tail\n\nanother block\n';
  await t.load(doc);

  for (let round = 1; round <= 3; round += 1) {
    await t.click(math(), 0.5);
    check(`round ${round}: the click opens the formula's source`, source() !== null, true);
    t.key('Backspace');
    await t.sleep(250);
    await emit('undo');
    await emit('redo');
    // Away from the formula, which is where a source view must end: the
    // formula renders again, and the document is the one the edits left.
    await t.click([...t.prose().querySelectorAll('.markdown-block')].pop(), 0.5);
    await t.sleep(300);
    check(`round ${round}: the formula renders again`, math() !== null && source() === null, true);
    check(
      `round ${round}: the document is intact`,
      await t.raw(),
      'text with $E = mc^$ inline and tail\n\nanother block\n'
    );
    check(
      `round ${round}: the raw source is not shown beside the text`,
      t.prose().textContent.includes('$E = mc^$'),
      false
    );
    await emit('undo');
    check(`round ${round}: undo restores the formula`, await t.raw(), doc);
  }
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()

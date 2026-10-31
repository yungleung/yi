/**
 * A revealed source ends when the caret goes elsewhere, on the default
 * document, for a node that still reveals its source: an inline formula.
 */
(async () => {
  const t = window.__t;
  const read = await window.__TAURI_INTERNALS__.invoke('plugin:fs|read_text_file', {
    path: `${window.__probePaths.checkout}test/fixtures/workspace/default-document.md`
  });
  const note = new TextDecoder().decode(
    read instanceof ArrayBuffer ? read : Uint8Array.from(read)
  );
  await t.load(note);
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const formula = () => t.prose().querySelector('[data-display="false"]');
  const source = () => t.prose().querySelector('.markdown-math-source');
  let heading = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    heading = [...t.prose().querySelectorAll('h2')].find(
      (candidate) => candidate.textContent === 'Math expressions'
    );
    if (heading) {
      heading.scrollIntoView({ block: 'start' });
      break;
    }
    const scroller = t.scroller();
    if (scroller) {
      scroller.scrollTop += 320;
    }
    await t.sleep(100);
  }
  await t.sleep(350);
  check('the default document renders its inline formula', formula() !== null, true);
  await t.click(formula(), 0.5);
  check('clicking it opens its source', source() !== null, true);
  // The virtual window can end at the formula after the fixture grows. Click a
  // known different block instead of assuming the last mounted one is elsewhere.
  const away = heading ?? [...t.prose().querySelectorAll('.markdown-block')].pop();
  await t.click(away, 0.5);
  await t.sleep(300);
  check('clicking away renders it again', source() === null && formula() !== null, true);
  check('with the document untouched', t.prose().textContent.includes('$E = mc^2$'), false);
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()

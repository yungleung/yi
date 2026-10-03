/**
 * The markdown a revealed inline run shows is the author's own characters: a
 * run written with underscores shows its underscores, and a run nested inside
 * another shows the container whole — the outermost run is the one revealed
 * (see `source_mode.ts: sourceRangeIn`).
 *
 * @covers src/ui/markdown/nodes/strong.ts, src/ui/markdown/nodes/emphasis.ts, src/ui/markdown/source_mode.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({ name, actual, expected, pass: JSON.stringify(actual) === JSON.stringify(expected) });
  const shownAs = (selector) => t.prose().querySelector(selector);
  const away = () => [...t.prose().querySelectorAll('.markdown-block')].pop();

  await t.load('a __B__ and _I_ c\n\nend\n');
  await t.click(shownAs('strong'), 0.99);
  await t.sleep(200);
  check(
    'underline bold shows the markers as written',
    shownAs('.markdown-strong-source')?.textContent ?? null,
    '__B__'
  );
  t.key('X');
  await t.sleep(250);
  check('and typing lands between them', await t.raw(), 'a __BX__ and _I_ c\n\nend\n');
  await t.click(away(), 0.5);
  await t.sleep(200);

  await t.click(shownAs('em'), 0.99);
  await t.sleep(200);
  check(
    'underline italic shows the markers as written',
    shownAs('.markdown-emphasis-source')?.textContent ?? null,
    '_I_'
  );
  t.key('Y');
  await t.sleep(250);
  check('and typing lands between them', await t.raw(), 'a __BX__ and _IY_ c\n\nend\n');

  // A run inside a run: the outermost revealable wins, so the whole bold is the
  // source — the italic is characters inside it, not a widget of its own.
  await t.load('**x *y* z**\n\nend\n');
  await t.click(shownAs('em'), 0.99);
  await t.sleep(200);
  check(
    'a nested run shows its container whole',
    shownAs('.markdown-strong-source')?.textContent ?? null,
    '**x *y* z**'
  );
  check('and the italic is gone with it', shownAs('em'), null);
  t.key('Z');
  await t.sleep(250);
  check('and typing edits the container text', await t.raw(), '**x *yZ* z**\n\nend\n');

  // Undo with the caret inside the run: the character goes back and the run's
  // source stays on screen, because the caret is still inside it.
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
  await t.sleep(250);
  check('undo takes the character back', await t.raw(), '**x *y* z**\n\nend\n');
  check(
    'and the container is still shown',
    shownAs('.markdown-strong-source')?.textContent ?? null,
    '**x *y* z**'
  );
  return { checks, failed: checks.filter((c) => !c.pass).map((c) => c.name) };
})()

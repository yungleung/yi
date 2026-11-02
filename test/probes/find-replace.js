/**
 * The find bar's replace-all, and what undoing it gives back.
 *
 * The bar computes matches from the raw document, selects the first one, and replaces
 * every match in one whole-document edit — so the edit is one undo step, and it remembers
 * the match the author was on: undoing it restores the text it replaced and puts that
 * match back under the selection, rather than leaving the caret wherever it happens to
 * be. The find path had no probe before this one.
 *
 * @covers src/ui/find/controller.ts, src/ui/markdown/editing/find/session.ts,
 *   src/ui/markdown/document/state.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const menu = (event) => window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event });
  const undo = async () => {
    await menu('undo');
    await t.sleep(300);
  };
  /** The bar keeps one input per row, and names them by their placeholder. */
  const input = (placeholder) =>
    [...document.querySelectorAll('input')].find((element) => element.placeholder === placeholder);
  /** The bar's actions are text buttons inside it. */
  const action = (label) =>
    [...document.querySelectorAll('button')].find((element) => element.textContent === label);
  const selectionNow = () => ({
    text: window.getSelection()?.toString() ?? null,
    collapsed: window.getSelection()?.isCollapsed ?? null
  });

  await t.load('alpha beta alpha gamma\n');
  await menu('replace');
  await t.sleep(250);
  const query = input('Find in Markdown');
  const replacement = input('Replace with');
  check('the replace bar opens', query !== null && replacement !== null, Boolean(query && replacement));
  if (!query || !replacement) {
    return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
  }

  query.value = 'alpha';
  query.dispatchEvent(new Event('input', { bubbles: true }));
  await t.sleep(250);
  check('the bar finds both matches', (document.querySelector('[data-find-status]')?.textContent ?? '') !== '', document.querySelector('[data-find-status]')?.textContent ?? null);
  check('and selects the first one', selectionNow().text === 'alpha', selectionNow());

  replacement.value = 'X';
  action('All').click();
  await t.sleep(300);
  const replaced = await t.raw();
  check('replace all replaces every match', replaced === 'X beta X gamma\n', replaced);

  await undo();
  const restored = selectionNow();
  const back = await t.raw();
  check('undo puts the text back', back === 'alpha beta alpha gamma\n', back);
  check(
    'and the match the bar was on is selected again',
    restored.text === 'alpha' && restored.collapsed === false,
    restored
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

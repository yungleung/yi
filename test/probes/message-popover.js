/**
 * A message the app tells the reader, as the card it now is.
 *
 * The failure is a real one and writes nothing: copying the id of a note whose frontmatter has none
 * (`tree_ops.ts: copy-id`), which the reader reaches from the tree's own menu. The place it names is
 * that note's row, so the card must appear under *that* row — and a message that names no place must
 * appear in the window's corner, where the toast it replaces sat.
 *
 * @covers src/services/messages.ts, src/ui/messages.ts
 * @covers src/ui/floating/beside.ts, src/ui/floating/placement.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const ops = await t.app('/src/ui/workspace/tree_ops.ts');
  // Emitted straight, for the one case no caller raises: a message with nothing to point at.
  const { eventManager } = await t.app('/src/services/event_manager.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const workspace = String((await invoke('get_config')).workspace ?? '');
  const notePath = `${workspace}/README.md`;
  const cards = () => [...document.querySelectorAll('[data-message]')];
  const card = () => cards().at(-1) ?? null;
  const row = () => document.querySelector(`[data-tree-path="${notePath}"]`);
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      right: Math.round(rect.right),
      bottom: Math.round(rect.bottom)
    };
  };
  /** The failure that raises the message: that note has no frontmatter id. */
  const noId = async () => {
    await ops.runTreeAction('copy-id', { path: notePath, basename: 'README.md', isFile: true });
    await t.sleep(250);
  };
  /** Closes every message on screen, so each case starts from none. */
  const clear = async () => {
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
    await t.sleep(200);
  };

  // 1. The card appears, says what went wrong, hangs under the row it is about, inside the window.
  await noId();
  const placed = {
    card: card() === null ? null : box(card()),
    row: box(row()),
    window: [window.innerWidth, window.innerHeight]
  };
  check(
    'the card appears under the row the message is about, inside the window',
    card() !== null &&
      card().querySelector('[data-message-text]')?.textContent?.includes('README') === true &&
      placed.card.top >= placed.row.bottom &&
      placed.card.left >= placed.row.left - 8 &&
      placed.card.right <= window.innerWidth - 8 &&
      placed.card.bottom <= window.innerHeight - 8,
    placed
  );

  // 2. The ✕ closes it…
  await clear();
  check('the ✕ closes it', cards().length === 0, { open: cards().length });

  // 3. …and Escape closes it too, which the toast never did.
  await noId();
  t.key('Escape');
  await t.sleep(200);
  check('and Escape closes it', cards().length === 0, { open: cards().length });

  // 4. Two messages at one place stack, the newer under the older.
  await noId();
  const first = box(card());
  await noId();
  const second = box(card());
  check('a second message at the same place hangs under the first', second.top >= first.bottom, {
    first,
    second
  });
  await clear();

  // 5. A message that names no place is in the corner, where the toast sat.
  await eventManager.emit('message', { text: 'A message with nothing to point at.' });
  await t.sleep(250);
  const corner = box(card());
  check(
    'a message with no place is in the window’s bottom-right corner',
    Math.abs(corner.right - (window.innerWidth - 8)) <= 10 &&
      Math.abs(corner.bottom - (window.innerHeight - 6)) <= 10,
    { corner, window: [window.innerWidth, window.innerHeight] }
  );
  await clear();

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()

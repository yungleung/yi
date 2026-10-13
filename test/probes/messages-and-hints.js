/**
 * The two surfaces the app says things with: a **message** for something that needs the reader's
 * attention, and a **hint** for something they only have to notice.
 *
 * A message waits in the window's bottom-right corner — whatever it is about, however far away that
 * is — with its ✕ at the card's right edge, until the reader closes it or presses Escape. A hint
 * sits beside the row it happened on and a press anywhere else takes it away.
 *
 * Both are raised by real work that writes nothing: copying the id of a note whose frontmatter has
 * none (a message), and copying a path (a hint) — the clipboard is stubbed, as `tree-file-actions`
 * does, because a probe may not ask the system for the real one.
 *
 * @covers src/services/messages.ts, src/ui/messages.ts
 * @covers src/services/hints.ts, src/ui/hints.ts
 * @covers src/ui/floating/beside.ts, src/ui/floating/placement.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const ops = await t.app('/src/ui/workspace/tree_ops.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const workspace = String((await invoke('get_config')).workspace ?? '');
  const notePath = `${workspace}/README.md`;
  const entry = { path: notePath, basename: 'README.md', isFile: true };
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => undefined }
  });
  const messages = () => [...document.querySelectorAll('[data-message]')];
  const message = () => messages().at(-1) ?? null;
  const hint = () => document.querySelector('[data-hint]');
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
  /** The failure that raises a message: that note has no frontmatter id. */
  const noId = async () => {
    await ops.runTreeAction('copy-id', entry);
    await t.sleep(250);
  };
  /** The success that raises a hint: the path goes on the clipboard. */
  const copyPath = async () => {
    await ops.runTreeAction('copy-path', entry);
    await t.sleep(250);
  };
  const clear = async () => {
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
    await t.sleep(200);
  };
  /** A press in the document, which is what a reader does next. */
  const pressElsewhere = async () => {
    const paragraph = t.prose().querySelector('p');
    paragraph?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await t.sleep(200);
  };

  // 1. A message waits in the corner, says what went wrong, and its ✕ is at the card's right edge.
  await noId();
  const placed = message() === null ? null : box(message());
  const close = message()?.querySelector('[data-message-close]');
  check(
    'a message waits in the window’s bottom-right corner, whatever it is about',
    placed !== null &&
      message()?.querySelector('[data-message-text]')?.textContent?.includes('README') === true &&
      Math.abs(placed.right - (window.innerWidth - 8)) <= 10 &&
      Math.abs(placed.bottom - (window.innerHeight - 6)) <= 10 &&
      placed.left < placed.right,
    { placed, window: [window.innerWidth, window.innerHeight], row: box(row()) }
  );
  check(
    'and its ✕ sits at the card’s right edge',
    close !== null && placed !== null && Math.abs(box(close).right - placed.right) <= 12,
    { close: close === null ? null : box(close), card: placed }
  );

  // 2. A press elsewhere leaves it: a message is for something that needs the reader's attention.
  await pressElsewhere();
  check('a press elsewhere leaves a message alone', messages().length === 1, {
    open: messages().length
  });

  // 3. Escape closes it, and so does its ✕.
  t.key('Escape');
  await t.sleep(200);
  check('and Escape closes it', messages().length === 0, { open: messages().length });
  await noId();
  await clear();
  check('as does its ✕', messages().length === 0, { open: messages().length });

  // 4. Two messages stack, the newer above the older, both in the corner.
  await noId();
  const first = box(message());
  await noId();
  const second = box(message());
  check('a second message stacks above the first', second.bottom <= first.top, { first, second });
  await clear();

  // 5. A hint sits beside its row, takes no ✕, and the next press puts it away.
  await copyPath();
  const shown = hint();
  check(
    'a hint appears beside the row it happened on, with no ✕ to press',
    shown !== null &&
      shown.querySelector('[data-hint-text]')?.textContent === 'Path copied.' &&
      box(shown).top >= box(row()).bottom &&
      shown.querySelector('[data-message-close]') === null,
    { hint: shown === null ? null : box(shown), row: box(row()), text: shown?.textContent ?? null }
  );
  await pressElsewhere();
  check('and a press elsewhere takes it away', hint() === null, { open: hint() !== null });
  await clear();

  // 6. Escape puts a hint away too, and leaves nothing of the card behind.
  await copyPath();
  t.key('Escape');
  await t.sleep(250);
  check('as does Escape, with no card left in the page', hint() === null, { open: hint() !== null });
  await clear();

  return { checks, failed: checks.filter((item) => !item.pass).map((item) => item.name) };
})()

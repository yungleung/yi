/**
 * Keyboard navigation through the document stack, and the status bar's two state colours.
 *
 * The reader can put the document on screen into the stack, then move through the stack in either
 * direction without opening its panel. A document that was not stacked is kept automatically before
 * the move, so following the shortcut never discards the document currently being read. The status
 * bar reads the same session facts: green when a document is stacked or saved, amber while it is
 * edited, and muted when it is outside the stack or read-only.
 *
 * @covers src/services/session/rules.ts, src/services/session/index.ts,
 *   src/commands/triggers/keymap.ts, src/ui/session/commands.ts,
 *   src/ui/status_bar/document.ts
 * @needs-workspace — navigation starts from the fixture workspace's default Markdown.
 */
(async () => {
  const t = window.__t;
  const session = await t.app('/src/services/session/index.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const state = () => session.documentSession.get();
  const current = () => session.documentSession.current();
  const stack = () => session.documentSession.stack();
  const status = (name) => document.querySelector(`[data-${name}]`);
  const words = (name) => status(name)?.textContent ?? null;
  const hasClass = (name, className) => status(name)?.classList.contains(className) === true;
  const color = (name) => {
    const element = status(name);
    return element === null ? null : getComputedStyle(element).color;
  };
  const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
  const prompting = () =>
    document.querySelector('[data-prompt]')?.classList.contains('hidden') === false;
  const fixturePath = `${window.__probePaths.checkout}test/fixtures/workspace/default-document.md`;

  /** The editor's real command/control path, not a direct command call. */
  const chord = async (key, shift = false) => {
    t.scroller().dispatchEvent(
      new KeyboardEvent('keydown', {
        key,
        shiftKey: shift,
        metaKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    await t.sleep(180);
  };

  /** Empties the stack, declining the save a dirty background document would ask about. */
  const dropEveryStacked = async () => {
    for (const held of [...state().documents]) {
      if (!held.stacked) {
        continue;
      }
      const pending = session.documentSession.drop(held.id);
      await t.sleep(80);
      if (prompting()) {
        document.querySelector('[data-prompt-no]')?.click();
      }
      await pending;
    }
    await t.sleep(120);
  };

  /** Opens a document and keeps the current one when the session asks. */
  const pushAndOpen = async (content) => {
    const pending = session.documentSession.openFile({ path: null, content });
    await t.sleep(100);
    if (prompting()) {
      document.querySelector('[data-prompt-yes]')?.click();
    }
    await pending;
    await t.sleep(180);
  };

  await session.documentSession.openFile({ path: fixturePath, content: await t.raw() });
  await t.sleep(180);
  await dropEveryStacked();
  const first = current();
  check(
    'the default Markdown starts saved and outside the stack, with green and muted statuses',
    first !== null &&
      words('document-stacked') === 'Not stacked' &&
      !hasClass('document-stacked', 'text-success') &&
      hasClass('document-stacked', 'text-base-content/60') &&
      color('document-stacked') !== color('document-saved') &&
      words('document-saved') === 'Saved' &&
      hasClass('document-saved', 'text-success'),
    {
      id: first?.id ?? null,
      stackLabel: words('document-stacked'),
      stackClasses: status('document-stacked')?.className ?? null,
      stackColor: color('document-stacked'),
      savedLabel: words('document-saved'),
      savedClasses: status('document-saved')?.className ?? null,
      savedColor: color('document-saved')
    }
  );

  await chord('p');
  check(
    'Cmd+P pushes the current document into the stack and turns its status green',
    current()?.stacked === true &&
      words('document-stacked')?.startsWith('In the stack') === true &&
      hasClass('document-stacked', 'text-success') &&
      color('document-stacked') === color('document-saved') &&
      !hasClass('document-stacked', 'opacity-70'),
    {
      stacked: current()?.stacked ?? null,
      label: words('document-stacked'),
      classes: status('document-stacked')?.className ?? null,
      color: color('document-stacked'),
      savedColor: color('document-saved')
    }
  );

  await chord('p');
  check(
    'Cmd+P again takes it out and returns the status to its muted colour',
    current()?.stacked === false &&
      words('document-stacked') === 'Not stacked' &&
      hasClass('document-stacked', 'text-base-content/60'),
    {
      stacked: current()?.stacked ?? null,
      label: words('document-stacked'),
      classes: status('document-stacked')?.className ?? null
    }
  );

  const paragraph = t.prose().querySelector('p');
  await t.click(paragraph);
  t.key('X');
  await t.sleep(180);
  check(
    'an edited document says Editing in amber, while Saved is green when clean',
    words('document-saved') === 'Editing' &&
      hasClass('document-saved', 'text-warning') &&
      color('document-saved') !== color('document-stacked') &&
      !hasClass('document-saved', 'opacity-70'),
    {
      label: words('document-saved'),
      classes: status('document-saved')?.className ?? null,
      color: color('document-saved'),
      stackColor: color('document-stacked'),
      contentChanged: current()?.content !== current()?.saved
    }
  );

  await pushAndOpen('# Second document\n\nA second document in the stack.\n');
  const second = current();
  check(
    'a newly opened document starts outside the stack',
    second !== null && second.stacked === false && stack().length === 1,
    { id: second?.id ?? null, stack: stack().map((document) => document.id) }
  );

  await chord('t');
  check(
    'Cmd+T stacks the current document before moving to the next stack entry',
    current()?.id === first?.id &&
      stack().map((document) => document.id).includes(second?.id ?? '') &&
      current()?.id !== second?.id,
    {
      current: current()?.id ?? null,
      first: first?.id ?? null,
      second: second?.id ?? null,
      stack: stack().map((document) => document.id)
    }
  );

  await chord('t', true);
  check(
    'Cmd+Shift+T moves back in the opposite direction',
    current()?.id === second?.id,
    { current: current()?.id ?? null, second: second?.id ?? null }
  );

  await invoke('plugin:event|emit', { event: 'next_stacked' });
  await t.sleep(180);
  await invoke('plugin:event|emit', { event: 'previous_stacked' });
  await t.sleep(180);
  check(
    'the native menu events use the same two navigation commands',
    current()?.id === second?.id,
    { current: current()?.id ?? null, second: second?.id ?? null }
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()

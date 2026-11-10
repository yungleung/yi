/**
 * The stack: pushing, opening a file over a stacked document, and what the status bar says.
 *
 * A click on a row of the workspace tree hands a path and a text to the session, which decides
 * what that means; the titlebar's stack button puts the document on screen into the stack; the
 * button beside it lists what is there; and the status bar says whether the document is saved
 * and whether it is stacked. All of that is driven here through the interface.
 *
 * The question the session asks — before a document can be lost — is a card in the page rather
 * than a native dialog, because a native one blocks the webview the harness drives; a probe
 * that met one hung for its whole budget. So the card is answered here like any other button.
 *
 * Neighbours: `document-stack-restore.js` (coming back to a document, where it was),
 * `document-stack-ask.js` (the rules about losing one) and `document-session-restart.js`.
 *
 * @covers src/services/session/rules.ts, src/services/session/index.ts,
 *   src/ui/toolbar/index.ts, src/ui/session/stack.ts,
 *   src/ui/status_bar/document.ts
 * @needs-workspace — it clicks rows of the fixture tree and reads the notes behind them, so the app
 *   has to be on the fixtures (`--with-workspace`) rather than on the reader's own folder
 */
(async () => {
  const t = window.__t;
  const session = await t.app('/src/services/session/index.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const steps = [];
  const step = (label) => {
    steps.push(`${label}@${Math.round(performance.now())}`);
    t.report({ steps });
  };

  const rows = () => [...document.querySelectorAll('[data-tree-path]')];
  const rowFor = (name) => rows().find((row) => (row.dataset.treePath ?? '').endsWith(name));
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === label
    );
  const status = (name) => document.querySelector(`[data-${name}]`)?.textContent ?? null;
  const state = () => session.documentSession.get();
  const page = () => t.prose().textContent ?? '';
  const prompting = () =>
    document.querySelector('[data-prompt]')?.classList.contains('hidden') === false;

  /** A click on a row, and the answer to the question it may raise. */
  const openRow = async (name, wanted) => {
    rowFor(name)?.click();
    await t.sleep(150);
    const asked = prompting();
    if (asked) {
      document
        .querySelector(wanted === 'yes' ? '[data-prompt-yes]' : '[data-prompt-no]')
        ?.click();
    }
    await t.sleep(350);
    return asked;
  };

  /** Empties the stack, answering the question a drop of an unsaved document asks. */
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
  };

  /** Opens a document through the session, answering the question it may raise. */
  const openDocument = async (path, content, wanted) => {
    const pending = session.documentSession.openFile({ path, content });
    await t.sleep(100);
    if (prompting()) {
      document
        .querySelector(
          wanted === 'yes' ? '[data-prompt-yes]' : '[data-prompt-no]'
        )
        ?.click();
    }
    await pending;
    await t.sleep(150);
  };

  // A known starting point: one fresh document on screen, nothing in the stack.
  await dropEveryStacked();
  step('dropped');
  await openDocument(null, 'A fresh document.\n\nIts second paragraph.\n', 'no');
  step('fresh');

  // 1. Opening a file, with the fresh document kept.
  const asked = await openRow('default-document.md', 'yes');
  step('opened');
  check(
    'a file clicked in the tree is the document on screen, and the one before it was asked about',
    asked &&
      page().includes('GitHub-flavored markdown demo') &&
      status('document-saved') === 'Saved' &&
      status('document-stacked') === 'Not stacked' &&
      session.documentSession.stack().length === 1,
    { asked, page: page().slice(0, 30), saved: status('document-saved'), held: session.documentSession.stack().length }
  );

  // 2. Typing makes it editing, and pushing keeps the latest version.
  const text = t.textNodesIn(t.prose().querySelector('p'))[0];
  const caret = document.createRange();
  caret.setStart(text, 3);
  caret.collapse(true);
  const rect = caret.getBoundingClientRect();
  text.parentElement.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
  );
  await t.sleep(120);
  t.key('X');
  await t.sleep(150);
  await t.command('session:toggleStack');
  await t.sleep(200);
  step('pushed');
  const held = session.documentSession.stack().find((document) => document.id === state().current);
  check(
    'the stack button pushes the document in, and the copy it keeps is the current text',
    status('document-saved') === 'Editing' &&
      status('document-stacked')?.startsWith('In the stack') === true &&
      (t.platform() !== 'macos' || button('Take out of the stack') !== undefined) &&
      (held?.content ?? '').includes('ThiX'),
    { saved: status('document-saved'), stack: status('document-stacked'), held: (held?.content ?? '').slice(0, 24) }
  );

  // 3. A second file, with the first safely stacked: no question.
  const askedAgain = await openRow('README.md', 'no');
  step('second');
  check(
    'a stacked document is replaced by the next file without a question',
    askedAgain === false &&
      page().startsWith('The fixture workspace') &&
      status('document-stacked') === 'Not stacked',
    { asked: askedAgain, page: page().slice(0, 30), stack: status('document-stacked') }
  );

  // 4. The stack lists what it holds, by title.
  await t.command('session:openStack');
  await t.sleep(150);
  step('popover');
  const listed = [...document.querySelectorAll('[data-stack-row]')].map((row) => ({
    id: row.dataset.stackRow,
    title: row.querySelector('[data-stack-open]')?.textContent ?? null
  }));
  check(
    'the stack lists the documents by title',
    listed.some((entry) => entry.title === 'GitHub-flavored markdown demo') &&
      listed.every((entry) => entry.id !== state().current),
    listed
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()

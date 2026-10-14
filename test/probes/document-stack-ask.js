/**
 * What the session asks before a document can be lost, and what each answer does.
 *
 * Opening a file replaces the document on screen. That is free when the document is already in
 * the stack — its latest version is there — and it costs the reader their work when it is not,
 * so it is asked about: pushing it keeps it, opening without it lets it go. Dropping a document
 * that is *not* on screen and has text its file does not have is asked about for the same
 * reason, and the answer that *saves* is deliberately never given here: it writes the file the
 * fixture workspace holds, and a probe leaves that folder as it found it.
 *
 * @covers src/services/session_rules.ts, src/services/session.ts, src/ui/session/session_prompt.ts
 * @needs-workspace — the files it opens are the fixtures' (`--with-workspace`)
 */
(async () => {
  const t = window.__t;
  const session = await t.app('/src/services/session.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const rows = () => [...document.querySelectorAll('[data-tree-path]')];
  const rowFor = (name) => rows().find((row) => (row.dataset.treePath ?? '').endsWith(name));
  const state = () => session.documentSession.get();
  const page = () => t.prose().textContent ?? '';
  const prompting = () =>
    document.querySelector('[data-prompt]')?.classList.contains('hidden') === false;
  const answer = (yes) => {
    document
      .querySelector(yes ? '[data-prompt-yes]' : '[data-prompt-no]')
      ?.click();
  };

  /** A click on a row, reporting whether it asked, and answering as told. */
  const openRow = async (name, wanted) => {
    rowFor(name)?.click();
    await t.sleep(150);
    const asked = prompting();
    if (asked) {
      answer(wanted === 'yes');
    }
    await t.sleep(350);
    return asked;
  };

  /** Opens a document through the session, answering the question it may raise. */
  const openDocument = async (content, wanted) => {
    const pending = session.documentSession.openFile({ path: null, content });
    await t.sleep(100);
    if (prompting()) {
      answer(wanted === 'yes');
    }
    await pending;
    await t.sleep(150);
  };

  /** Empties the stack, answering the question a drop of an unsaved document asks. */
  const dropEveryStacked = async (wanted) => {
    for (const held of [...state().documents]) {
      if (!held.stacked) {
        continue;
      }
      const pending = session.documentSession.drop(held.id);
      await t.sleep(80);
      if (prompting()) {
        answer(wanted);
      }
      await pending;
    }
  };

  // 1. An unstacked document is asked about, and "yes" keeps it in the stack.
  await dropEveryStacked(false);
  await openDocument('A document to keep.\n', 'no');
  const first = state().current;
  const asked = await openRow('default-document.md', 'yes');
  check(
    'a document that is not stacked is asked about, and "yes" keeps it',
    asked &&
      (await t.sleep(0), session.documentSession.stack().some((held) => held.id === first)) &&
      page().startsWith('GitHub-flavored markdown demo'),
    {
      asked,
      held: session.documentSession.stack().map((held) => held.id),
      page: page().slice(0, 24)
    }
  );

  // 2. The same case with "no": the document on screen goes, and nothing keeps it.
  await dropEveryStacked(false);
  await openDocument('A document to lose.\n', 'no');
  const lost = state().current;
  const askedAgain = await openRow('README.md', 'no');
  check(
    'and "no" lets it go',
    askedAgain &&
      state().documents.every((held) => held.id !== lost) &&
      page().startsWith('The fixture workspace'),
    { asked: askedAgain, ids: state().documents.map((held) => held.id.slice(-24)), page: page().slice(0, 24) }
  );

  // 3. A stacked document is never asked about: push the one on screen first, then open another.
  session.documentSession.toggleStack();
  await t.sleep(150);
  const quiet = await openRow('default-document.md', 'no');
  check(
    'a stacked document is replaced without a question',
    quiet === false && page().startsWith('GitHub-flavored markdown demo'),
    { asked: quiet, page: page().slice(0, 24) }
  );

  // 4. Dropping an unsaved document that is *not* on screen is asked about. It has to be edited
  // first: a document whose text is what its file holds has nothing to lose.
  const text = t.textNodesIn(t.prose().querySelectorAll('p')[0])[0];
  const caret = document.createRange();
  caret.setStart(text, 3);
  caret.collapse(true);
  const rect = caret.getBoundingClientRect();
  text.parentElement.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
  );
  await t.sleep(120);
  t.key('Q');
  await t.sleep(150);
  session.documentSession.toggleStack();
  await t.sleep(150);
  const unsaved = state().current;
  await openDocument('Another document, so the edited one is behind.\n', 'yes');
  const dropping = session.documentSession.drop(unsaved);
  await t.sleep(120);
  const askedToSave = prompting();
  if (askedToSave) {
    answer(false);
  }
  await dropping;
  check(
    'dropping an unsaved document is asked about, and "no" drops it',
    askedToSave &&
      !session.documentSession.stack().some((held) => held.id === unsaved),
    { asked: askedToSave, held: session.documentSession.stack().length }
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()

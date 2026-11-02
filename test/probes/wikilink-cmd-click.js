/**
 * What each gesture on a wikilink does.
 *
 * A plain click belongs to the editor: the node shows its own markdown, like every other node
 * whose rendering holds none of its characters. ⌘-click (Ctrl-click) asks for the *document* the
 * link names instead, and that request travels the shell: the click carries the target
 * (`[[Second note]]` → `Second note`), the app resolves it — by file name or by frontmatter id —
 * and opens it the way a click in the tree does, through the session, so what happens to the
 * document on screen is the session's own decision (the question before an unstacked one is lost,
 * the stack, the caret, the session write). A target no document in the workspace answers to is
 * said so, rather than opening something else.
 *
 * The note this probe opens draws a heading that is *not* its file name, so a click that opened
 * the text on screen instead of the target it names fails here.
 *
 * The probe makes its own workspace with the app's own commands and removes it again: the
 * repository's fixtures are not a test's to open. It sits under the home directory, because the
 * app *reads* the note a wikilink names through the file plugin and that is what the plugin is
 * scoped to (`~/`, `src-tauri/capabilities/default.json`) — a folder anywhere else can be listed
 * and written, and not read. Whether the session asks its question first is the reader's config
 * (`push_unstacked_on_open`) and the session's own state, so the probe answers the question when
 * it comes and never requires it.
 *
 * @covers src/ui/markdown/click_routing.ts, src/ui/markdown/nodes/wikilink.ts,
 *   src/ui/markdown/link_opens.ts, src/ui/editor_panel.ts
 * @needs-workspace
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const home = await window.__TAURI_INTERNALS__.invoke('plugin:path|resolve_directory', {
    directory: 21
  });
  const workspace = `${home}/yi-probe-wikilink-open`;
  const notePath = `${workspace}/Second note.md`;
  const noteText = '# A different heading\n\nThe second note’s own words.\n';
  const doc = 'A note with [[Second note]] and [[nowhere]] inside.\n';
  const links = () => [...t.prose().querySelectorAll('.markdown-wikilink')];
  const source = () => t.prose().querySelector('.markdown-wikilink-source');
  /**
   * The document as it looks with the caret *outside* both links.
   *
   * A wikilink whose node the caret is in shows its own markdown instead of its title
   * (`nodes/revealable_node.ts`), and a caret left over from the step before can be inside one —
   * the load keeps the offset it had. The click lands past the last word, which is where no link
   * is, so the two links are the two views the checks click.
   */
  const showTheDocument = async () => {
    await t.load(doc);
    await t.click(t.prose().querySelector('.markdown-block'), 0.99, 0.99);
    await t.sleep(200);
  };
  const messages = () =>
    [...document.querySelectorAll('[data-message-text]')].map((each) => each.textContent ?? '');
  const clearMessages = () => {
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
  };
  /** Clicks a point in an element, with the gesture's modifier keys, the way the browser sends it. */
  const click = (element, modifier = {}) => {
    const box = element.getBoundingClientRect();
    element.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        ...modifier,
        clientX: Math.round(box.left + box.width / 2),
        clientY: Math.round(box.top + box.height / 2)
      })
    );
  };
  /** Answers the session's question, when it asks one, so an open can finish. */
  const answerTheQuestion = () => {
    if (document.querySelector('[data-prompt]')?.classList.contains('hidden') === false) {
      document.querySelector('[data-prompt-yes]')?.click();
    }
  };
  const openedDocument = () => ({
    path: session.documentSession.current()?.path ?? null,
    text: t.prose().textContent ?? ''
  });

  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off; it is about to be replaced.
    }
    await files.createEntry(home, 'yi-probe-wikilink-open', false);
    await files.createEntry(workspace, 'Second note.md', true);
    await files.writeTextAtomically(notePath, noteText);
    previous = await t.openWorkspace(workspace);

    // 1. A plain click is still the editor's: the node shows the markdown the author typed.
    await showTheDocument();
    check(
      'both links render as their views before anything is clicked',
      links().length === 2 && source() === null,
      links().map((element) => element.textContent)
    );
    click(links()[0]);
    await t.sleep(300);
    check(
      'a plain click still opens the wikilink as its own source',
      source()?.textContent === '[[Second note]]',
      source()?.textContent ?? null
    );
    check('and the document is untouched', (await t.raw()) === doc, await t.raw());

    // 2. ⌘-click (and Ctrl-click with it): the document the link names comes on screen, through
    //    the session — the same path a click on the tree's own row takes.
    await showTheDocument();
    click(links()[0], { metaKey: true });
    await t.sleep(200);
    answerTheQuestion();
    await t.sleep(400);
    const opened = openedDocument();
    check('a cmd-click opens the document the link names', (await t.raw()) === noteText, opened.text.slice(0, 40));
    check('and the session holds that file', opened.path === notePath, opened.path);

    await showTheDocument();
    click(links()[0], { ctrlKey: true });
    await t.sleep(200);
    answerTheQuestion();
    await t.sleep(400);
    check('a ctrl-click does the same', session.documentSession.current()?.path === notePath, openedDocument().path);

    // 3. A target no document answers to: nothing opens, and the reader is told why.
    await showTheDocument();
    clearMessages();
    click(links()[1], { metaKey: true });
    await t.sleep(400);
    check('a target the workspace has no document for opens nothing', (await t.raw()) === doc, await t.raw());
    check(
      'and the reader is told which target could not be found',
      messages().some((each) => each.includes('nowhere')),
      messages()
    );
  } finally {
    clearMessages();
    await t.restoreWorkspace(previous);
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Nothing to clean up if the folder was never made.
    }
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

/**
 * A link to a note, followed with ⌘ (Ctrl): the file beside the note, the one written from the root
 * of the workspace, the same path spelled with `%20`, and one that is not there at all.
 *
 * A *destination* is a path a reader writes as often as a URL they paste, and a path is not
 * something the webview may be handed: a plain click on a link shows its markdown, which is the
 * editor's, and ⌘-click asks the app for the note it names (`click_routing.ts: routeLinkClick` →
 * `link_opens.ts`), which the shell resolves (`ui/editor_panel.ts`) against the note's own folder
 * first and the workspace root next — the two folders an image's path is read from, including the
 * `%20` spelling a copied path may carry — and then opens through the session, exactly as a click
 * on a row of the tree does.
 *
 * A URL keeps its gesture (`link-cmd-click.js` holds that): ⌘-click on one leaves for the system's
 * browser, and the app never navigates to it.
 *
 * The probe makes its own workspace under the home directory — what the file plugin and the asset
 * protocol are scoped to — points the app at it, and puts both back afterwards.
 *
 * @covers src/ui/markdown/click_routing.ts, src/ui/markdown/link_opens.ts,
 *   src/ui/editor_panel.ts, src/ui/markdown/syntax/link_edits.ts
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
  const workspace = `${home}/yi-probe-link-open`;
  const notes = `${workspace}/notes`;
  // A name of its own for every run: a document the session already holds comes back as itself
  // (`services/session/index.ts: restore`), and a *current* one that matches is a no-op that leaves the
  // editor showing whatever was there before (`openFile`), which is not a document this probe wrote.
  const reading = `${notes}/note-${Date.now()}.md`;
  const letters = [
    '[sibling](sibling.md)',
    '[from the root](root.md)',
    '[encoded](my%20sibling.md)',
    '[spaced](my sibling.md)',
    '[missing](gone.md)'
  ].join('\n');
  const links = () => [...t.prose().querySelectorAll('a.markdown-link')];
  const shown = () => ({
    path: session.documentSession.current()?.path ?? null,
    text: (t.prose().textContent ?? '').trim().slice(0, 30)
  });
  const messages = () =>
    [...document.querySelectorAll('[data-message-text]')].map((each) => each.textContent ?? '');
  /** Answers the session's question when it asks one, so opening can finish. */
  const answerTheQuestion = () => {
    if (document.querySelector('[data-prompt]')?.classList.contains('hidden') === false) {
      document.querySelector('[data-prompt-yes]')?.click();
    }
  };
  /** Opens the note the probe reads through the session, answering the question it may ask. */
  const openReading = async () => {
    session.documentSession.openPath(reading);
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await t.sleep(60);
      answerTheQuestion();
      if (session.documentSession.current()?.path === reading && links().length === 5) {
        break;
      }
    }
    // The caret is put in the prose, so no link is showing its own markdown: a link whose node the
    // caret is in is built as its source instead of as the link (`nodes/revealable_node.ts`), and a
    // remembered caret may be in one.
    await t.click(t.prose().querySelector('.markdown-block'), 0.99, 0.5);
    await t.sleep(150);
  };
  /**
   * Follows the link at `index` with ⌘ and waits for what it did: the session asking its question,
   * the note it opened, or the message a destination that is not there earns.
   */
  const follow = async (index) => {
    const anchor = links()[index];
    if (!anchor) {
      check(`the note’s link ${index} is on screen to click`, false, links().length);
      return;
    }
    const box = anchor.getBoundingClientRect();
    anchor.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        clientX: Math.round(box.left + box.width / 2),
        clientY: Math.round(box.top + box.height / 2)
      })
    );
    for (let attempt = 0; attempt < 15; attempt += 1) {
      await t.sleep(60);
      answerTheQuestion();
      if (session.documentSession.current()?.path !== reading || messages().length > 0) {
        break;
      }
    }
    await t.sleep(150);
  };

  let previous = null;
  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off; it is about to be replaced.
    }
    await files.createEntry(home, 'yi-probe-link-open', false);
    await files.createEntry(workspace, 'notes', false);
    await files.writeTextAtomically(reading, `The reading note.\n\n${letters}\n`);
    await files.writeTextAtomically(`${notes}/sibling.md`, 'The sibling note.\n');
    await files.writeTextAtomically(`${notes}/my sibling.md`, 'The note with a space.\n');
    await files.writeTextAtomically(`${workspace}/root.md`, 'The note by the root.\n');
    previous = await t.openWorkspace(workspace);

    // 1. The note beside the one being read.
    await openReading();
    check('the note is on screen with its links', links().length === 5, links().length);
    await follow(0);
    check(
      'a link to the note beside it opens that note',
      shown().path === `${notes}/sibling.md` && shown().text.startsWith('The sibling note.'),
      shown()
    );

    // 2. The one written from the root of the workspace — the second folder a path is read from.
    await openReading();
    await follow(1);
    check(
      'a link written from the workspace root opens that note',
      shown().path === `${workspace}/root.md` && shown().text.startsWith('The note by the root.'),
      shown()
    );

    // 3. The same path as a browser spells it, and as a reader writes it: both are the file.
    await openReading();
    await follow(2);
    check(
      'a path spelled with %20 opens the file it resolves to',
      shown().path === `${notes}/my sibling.md` && shown().text.startsWith('The note with a space.'),
      shown()
    );
    await openReading();
    await follow(3);
    check(
      'a path written with a space opens it too',
      shown().path === `${notes}/my sibling.md` && shown().text.startsWith('The note with a space.'),
      shown()
    );

    // 4. A link to nothing: the note on screen stays, and the reader is told which path failed.
    await openReading();
    await follow(4);
    check(
      'a link to a file that is not there opens nothing',
      shown().path === reading && shown().text.startsWith('The reading note.'),
      shown()
    );
    check(
      'and the reader is told which path could not be opened',
      messages().some((each) => each.includes('gone.md')),
      messages()
    );
  } finally {
    for (const close of [...document.querySelectorAll('[data-message-close]')]) {
      close.click();
    }
    await t.restoreWorkspace(previous);
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Nothing to clean up if the folder was never made.
    }
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})().catch((error) => ({ threw: String(error), stack: (error?.stack ?? '').split('\n').slice(0, 4) }))

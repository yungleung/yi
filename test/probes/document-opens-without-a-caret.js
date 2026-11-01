/**
 * A document that is opened, and nothing about where the reader was: no caret is placed.
 *
 * A caret the app invents is a caret the reader never put anywhere, and it decides what the page
 * shows: a node the caret is in renders its own markdown instead of its view
 * (`source_mode.ts`), so a note that *starts* with a picture — a reading library is full of them —
 * opened showing that picture's markdown, with the picture hidden, until the caret moved. The
 * caret a document is opened with is the session's to say: a remembered one is placed exactly
 * where it was (`document-session-restart.js` holds that), and one the session does not have
 * leaves the caret where it is — nowhere — so the document renders as it is written.
 *
 * Typing still works with no caret, and this probe holds that too: the first keystroke in a
 * document nobody has put a caret in writes at the text's own start, which is what a reader
 * typing straight after opening a note means.
 *
 * The probe makes its own folder under the home directory — what the file plugin and the asset
 * protocol are scoped to — and removes it again. It points the app at no workspace: a note's own
 * folder comes from the session showing the note.
 *
 * @covers src/services/session/rules.ts, src/ui/markdown/markdown_editor.ts,
 *   src/ui/markdown/editing/text_commands.ts
 */
(async () => {
  const t = window.__t;
  const files = await t.app('/src/api/files.ts');
  const session = await t.app('/src/services/session/index.ts');
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const home = await window.__TAURI_INTERNALS__.invoke('plugin:path|resolve_directory', {
    directory: 21
  });
  const workspace = `${home}/yi-probe-caret`;
  const png = Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg=='
    ),
    (character) => character.charCodeAt(0)
  );
  const note = '![shot](shot.png)\nProse under the picture.\n';
  // A name of its own for every run: a document the session has seen before comes back *with* its
  // remembered caret (`services/session/index.ts: restore`), and this probe is about a document the
  // session remembers nothing about. The folder is the probe's own and goes at the end either way.
  const notePath = `${workspace}/note-${Date.now()}.md`;
  const picture = () => {
    const image = t.prose().querySelector('img[alt="shot"]');
    return { width: image?.naturalWidth ?? 0, sources: t.prose().querySelectorAll('.markdown-image-source').length };
  };

  /** Answers the session's question when it asks one, so opening and leaving can finish. */
  const answerTheQuestion = () => {
    if (document.querySelector('[data-prompt]')?.classList.contains('hidden') === false) {
      document.querySelector('[data-prompt-yes]')?.click();
    }
  };
  /** A caret as the place it names: the text it is in, and how far into it. */
  const whereIs = (range) =>
    range === null
      ? null
      : `${(range.startContainer.textContent ?? '').slice(0, 20)}@${range.startOffset}`;
  /** The document offset a caret names in a revealed source or an ordinary text run. */
  const documentOffset = (range) => {
    if (range === null) {
      return null;
    }
    const parent = (
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement
    );
    const source = parent?.closest('[data-source-from]');
    const text = parent?.closest('[data-text-from]');
    const element = source ?? text;
    const from = source?.dataset.sourceFrom ?? text?.dataset.textFrom;
    const block = element?.closest('.markdown-block');
    if (!element || !block || from === undefined) {
      return null;
    }
    return Number(block.dataset.charStart) + Number(from) + range.startOffset;
  };

  /**
   * Opens a document through the session, answering the question it may ask first — the document on
   * screen may be the reader's own unsaved one, and the session asks before it is lost.
   */
  const openNote = async (path) => {
    const opened = session.documentSession.openPath(path);
    await t.sleep(250);
    answerTheQuestion();
    await opened;
    await t.sleep(250);
  };

  try {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // A leftover from a probe that was cut off; it is about to be replaced.
    }
    await files.createEntry(home, 'yi-probe-caret', false);
    await window.__TAURI_INTERNALS__.invoke('plugin:fs|write_file', png, {
      headers: { path: encodeURIComponent(`${workspace}/shot.png`) }
    });
    await files.writeTextAtomically(notePath, note);
    await files.writeTextAtomically(`${workspace}/other.md`, 'Something else.\n');

    // A document of the probe's own to start from: saved, and with no file, so every open that
    // follows is the session's plain "open" — no question about what was on screen, and so nothing
    // this probe measures depends on what the reader had open when the app started.
    const priming = session.documentSession.openFile({ path: null, content: 'Primed.\n' });
    await t.sleep(250);
    answerTheQuestion();
    await priming;
    await t.sleep(200);

    // 1. Opening it: the picture is a picture, and no caret has been placed.
    await openNote(notePath);
    await t.sleep(500);
    const opened = picture();
    const onScreen = session.documentSession.current();
    check(
      'the note the probe opened is the document on screen',
      onScreen?.path === notePath,
      { path: onScreen?.path ?? null, text: (onScreen?.content ?? '').slice(0, 30) }
    );
    check('a document opens with its leading picture drawn', opened.width === 2, opened);
    check('and with no caret at all', caret.getCaretRange() === null, caret.getCaretRange() === null);

    // 2. Typing with no caret: the letter writes at the text's own start.
    t.key('X');
    await t.sleep(400);
    const typed = await t.raw();
    const beforeLeaving = whereIs(caret.getCaretRange());
    const beforeLeavingOffset = documentOffset(caret.getCaretRange());
    check('a letter typed with no caret writes at the text’s start', typed.startsWith('X'), typed.slice(0, 30));

    // 3. The other half: a caret the session *does* remember is placed again, where it was. Leaving
    //    the document is what captures its view and coming back is the session's own show — the
    //    path a restart takes too. The place is read off the caret itself, before and after, so
    //    this says "the same place" rather than "some caret".
    await openNote(`${workspace}/other.md`);
    const heldView = session.documentSession
      .get()
      .documents.find((document) => document.path === notePath)?.view;
    await openNote(notePath);
    const restored = caret.getCaretRange();
    const restoredOffset = documentOffset(restored);
    check(
      'a caret the session remembers is placed again, where it was',
      restored !== null &&
        beforeLeavingOffset !== null &&
        restoredOffset === beforeLeavingOffset &&
        restoredOffset === heldView?.caret,
      {
        remembered: heldView?.caret ?? null,
        left: beforeLeaving,
        leftOffset: beforeLeavingOffset,
        cameBack: whereIs(restored),
        cameBackOffset: restoredOffset
      }
    );
  } finally {
    try {
      await files.deleteEntry(workspace);
    } catch {
      // Nothing to clean up if the folder was never made.
    }
  }
  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

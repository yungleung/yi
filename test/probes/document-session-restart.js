/**
 * What a restart puts back.
 *
 * The session is written to a file as it changes, and read on the way up: the documents, which
 * one is current, where the reader was in it, and what the stack holds. This asserts both
 * halves — the file says what the session says, and the path the app runs at startup
 * (`documentSession.load()`) puts the document, its text and its view back.
 *
 * The reload is *simulated* rather than performed: a probe that reloads the page kills itself.
 * What a reload does that this cannot is start the app again, and the file is what crosses that
 * boundary — which is why the file is read back here rather than assumed.
 *
 * @covers src/services/document_session.ts, src/services/session.ts, src-tauri/src/session.rs
 */
(async () => {
  const t = window.__t;
  const session = await t.app('/src/services/session.ts');
  const api = await t.app('/src/api/session.ts');
  const model = await t.app('/src/services/document_session.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const prompting = () =>
    document.querySelector('[data-session-prompt]')?.classList.contains('hidden') === false;

  /** Opens a document through the session, answering the question it may raise. */
  const open = async (path, content) => {
    const pending = session.documentSession.openFile({ path, content });
    await t.sleep(120);
    if (prompting()) {
      document.querySelector('[data-session-prompt-no]')?.click();
    }
    await pending;
    await t.sleep(200);
  };

  const text = `${Array.from({ length: 30 }, (_, index) => `Paragraph ${index} of the note.`).join('\n\n')}\n`;
  await open(null, text);
  const id = session.documentSession.get().current;

  const paragraph = t.textNodesIn(t.prose().querySelector('p'))[0];
  const caret = document.createRange();
  caret.setStart(paragraph, 5);
  caret.collapse(true);
  const rect = caret.getBoundingClientRect();
  paragraph.parentElement.dispatchEvent(
    new MouseEvent('click', { bubbles: true, clientX: rect.left + 1, clientY: rect.top + 2 })
  );
  await t.sleep(120);
  t.key('Z');
  await t.sleep(150);
  t.scroller().scrollTop = 300;
  await t.sleep(250);
  const leftAt = Math.round(t.scroller().scrollTop);
  // A scroll is captured 400ms after it stops and the file is written 800ms after *that*, so
  // the file a moment after the reader stops moving is the file this waits for.
  await t.sleep(1500);

  // 1. The file the app would read on the way up holds what the session holds.
  const written = model.parseSession(await api.loadSessionText());
  const stored = written.documents.find((document) => document.id === id) ?? null;
  check(
    'the session file holds the document, its text and where the reader is',
      written.current === id &&
      stored !== null &&
      stored.content.includes('ParagZraph') &&
      typeof stored.view.caret === 'number' &&
      stored.view.scroll !== null,
    {
      current: written.current === id,
      text: (stored?.content ?? '').slice(0, 30),
      view: stored?.view ?? null
    }
  );

  // 2. The startup path puts it back.
  session.documentSession.restore(id);
  await t.sleep(150);
  t.scroller().scrollTop = 0;
  await t.sleep(150);
  await session.documentSession.load();
  await t.sleep(600);
  const back = Math.round(t.scroller().scrollTop);
  check(
    'and the startup path puts the document and its view back',
    session.documentSession.get().current === id &&
      (t.prose().textContent ?? '').startsWith('ParagZraph 0 of the note.') &&
      Math.abs(back - leftAt) <= 40,
    { current: session.documentSession.get().current === id, scroll: { leftAt, back } }
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name),
    written: {
      current: written.current,
      documents: written.documents.length
    }
  };
})()

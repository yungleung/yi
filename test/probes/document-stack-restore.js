/**
 * Coming back to a document from the stack: its text, its view, and its caret.
 *
 * A document is left part-way down and part-way through a word, put in the stack, and left
 * behind for another file; then the stack's own row brings it back. A pixel scroll position is
 * not what is remembered — the renderer mounts a window of blocks and estimates the rest, so
 * pixels mean different places at different times — but the block at the top of the view and
 * the caret's document offset are, and both have to land where the reader left them.
 *
 * `document-stack.js` holds the push and the listing; this holds the coming back.
 *
 * @covers src/services/session/rules.ts, src/services/session/index.ts,
 *   src/ui/markdown/markdown_editor.ts, src/ui/markdown/virtual_block_renderer.ts,
 *   src/ui/session/stack.ts
 * @needs-workspace — the files it opens are the fixtures' (`--with-workspace`)
 */
(async () => {
  const t = window.__t;
  const session = await t.app('/src/services/session/index.ts');
  const caretModule = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });

  const rows = () => [...document.querySelectorAll('[data-tree-path]')];
  const rowFor = (name) => rows().find((row) => (row.dataset.treePath ?? '').endsWith(name));
  const button = (label) =>
    [...document.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === label
    );
  const state = () => session.documentSession.get();
  const current = () => session.documentSession.current();
  const prompting = () =>
    document.querySelector('[data-prompt]')?.classList.contains('hidden') === false;

  /** A click on a row, and the answer to the question it may raise. */
  const openRow = async (name, wanted) => {
    rowFor(name)?.click();
    await t.sleep(150);
    if (prompting()) {
      document
        .querySelector(wanted === 'yes' ? '[data-prompt-yes]' : '[data-prompt-no]')
        ?.click();
    }
    await t.sleep(350);
  };

  // The question before a file opens is answered "no" here: answering "save" writes the fixture
  // the workspace tree is pointed at, and these probes must leave that folder as they found it.
  for (const held of [...state().documents]) {
    if (held.stacked) {
      const pending = session.documentSession.drop(held.id);
      await t.sleep(80);
      if (prompting()) {
        document.querySelector('[data-prompt-no]')?.click();
      }
      await pending;
    }
  }
  await t.sleep(100);

  // 1. A document with a caret inside a visible paragraph and the view part-way down.
  await openRow('default-document.md', 'no');
  t.scroller().scrollTop = 400;
  await t.sleep(250);
  const viewport = t.scroller().getBoundingClientRect();
  const paragraph = [...t.prose().querySelectorAll('p')].find((element) => {
    const box = element.getBoundingClientRect();
    return box.top >= viewport.top + 8 && box.bottom <= viewport.bottom - 8;
  });
  const text = paragraph === undefined ? null : t.textNodesIn(paragraph)[0];
  check('a visible paragraph holds the caret', text !== null && text.data.length >= 3, Boolean(text));
  if (text === null) {
    return {
      checks,
      failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
    };
  }
  const caret = document.createRange();
  caret.setStart(text, 3);
  caret.collapse(true);
  caretModule.showCaret(caret);
  t.prose().focus({ preventScroll: true });
  await t.sleep(120);
  t.key('X');
  await t.sleep(150);
  const typedParagraph = paragraph?.textContent ?? '';
  const expectedSequence = `${typedParagraph.slice(0, 3)}XY`;
  await t.command('session:toggleStack');
  await t.sleep(150);
  await t.sleep(200);
  const leftAt = Math.round(t.scroller().scrollTop);
  const stackId = state().current;

  // 2. Leave it for another file — the second one reads and shows in one go.
  await openRow('README.md', 'no');
  check(
    'the document being left is replaced by the next file',
    (t.prose().textContent ?? '').startsWith('The fixture workspace'),
    { page: (t.prose().textContent ?? '').slice(0, 26) }
  );

  // 3. The stack's own row brings it back.
  await t.command('session:openStack');
  await t.sleep(150);
  document.querySelector(`[data-stack-open="${CSS.escape(stackId)}"]`)?.click();
  await t.sleep(500);
  const back = Math.round(t.scroller().scrollTop);
  // Within a screen, not within a pixel: where the reader is is remembered as the block at the
  // top of the view, and the blocks above it are *estimated* until they are laid out (a line of
  // body text each, whatever they are). On this document the headings above the view are taller
  // than their estimate by twenty to thirty pixels each — measured, about a hundred pixels in
  // all — so a restore lands on the right block and near the right line, and exactly when the
  // blocks above have been measured. The caret is an offset and is exact.
  check(
    'and the row brings the document and its view back',
    (t.prose().textContent ?? '').includes('GitHub-flavored markdown demo') &&
      Math.abs(back - leftAt) <= 160,
    { scroll: { leftAt, back }, page: (t.prose().textContent ?? '').slice(0, 26) }
  );

  const restoredRange = caretModule.getCaretRange();
  t.key('Y');
  await t.sleep(200);
  const restoredContent = current()?.content ?? '';
  const restoredAt = restoredContent.indexOf(expectedSequence);
  const restoredDocument = current();
  check(
    'with the caret where it was left, inside the word it was in',
    restoredAt >= 0,
    {
      restoredAt,
      caret: restoredRange === null
        ? null
        : {
            text: restoredRange.startContainer.textContent,
            offset: restoredRange.startOffset,
            connected: restoredRange.startContainer.isConnected
          },
      id: restoredDocument?.id ?? null,
      expectedId: stackId,
      view: restoredDocument?.view ?? null,
      lines: [...t.prose().querySelectorAll('.markdown-block')].map(
        (block) => block.dataset.lineStart
      ),
      active: document.activeElement?.className ?? null,
      content: restoredAt >= 0 ? restoredContent.slice(restoredAt - 20, restoredAt + 24) : restoredContent.slice(0, 80)
    }
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()

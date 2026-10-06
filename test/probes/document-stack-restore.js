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
 * @covers src/services/session_rules.ts, src/services/session.ts,
 *   src/ui/markdown/markdown_editor.ts, src/ui/markdown/virtual_block_renderer.ts,
 *   src/ui/session/stack_popover.ts
 */
(async () => {
  const t = window.__t;
  const session = await t.app('/src/services/session.ts');
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

  // 1. A document with a caret inside a paragraph and the view part-way down.
  await openRow('default-document.md', 'no');
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
  button('Push to the stack')?.click();
  await t.sleep(150);
  t.scroller().scrollTop = 400;
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
  button('Open the stack')?.click();
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
    (t.prose().textContent ?? '').startsWith('GitHub-flavored markdown demo') &&
      Math.abs(back - leftAt) <= 160,
    { scroll: { leftAt, back }, page: (t.prose().textContent ?? '').slice(0, 26) }
  );

  t.key('Y');
  await t.sleep(200);
  check(
    'with the caret where it was left, inside the word it was in',
    (current()?.content ?? '').includes('ThiXY'),
    { content: (current()?.content ?? '').slice(0, 40) }
  );

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()

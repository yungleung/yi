/**
 * A selected range in the document shows the editing bar near the text. It contains the
 * formatting, insertion, list, footnote and table controls, but not the workspace or session
 * controls; collapsing the selection puts it away.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const bar = () => document.querySelector('[data-selection-toolbar]');
  const labels = () =>
    [...(bar()?.querySelectorAll('button[aria-label]') ?? [])].map((button) =>
      button.getAttribute('aria-label')
    );
  const select = async () => {
    const node = t.textNodesIn(t.blocks()[0]).find((text) => text.data.includes('selected words'));
    const range = document.createRange();
    range.setStart(node, node.data.indexOf('selected'));
    range.setEnd(node, node.data.indexOf('words') + 'words'.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    await t.sleep(250);
    return range.getBoundingClientRect();
  };

  const doc = 'These selected words are here.\n';
  await t.load(doc);
  const rect = await select();
  check('selecting document text shows the selection toolbar', bar() !== null, Boolean(bar()));
  const barRect = bar()?.getBoundingClientRect();
  check(
    'the toolbar is visible and near the selected range',
    Boolean(barRect) &&
      barRect.width > 0 &&
      barRect.left >= 0 &&
      barRect.right <= window.innerWidth &&
      Math.abs(barRect.top - rect.top) < 120,
    barRect
      ? {
          left: Math.round(barRect.left),
          right: Math.round(barRect.right),
          top: Math.round(barRect.top)
        }
      : null
  );
  const shown = labels();
  for (const label of ['Bold', 'Italic', 'Strikethrough', 'Inline code', 'Link', 'Image']) {
    check(`the selection bar includes ${label}`, shown.includes(label), shown);
  }
  check(
    'the selection bar includes list, footnote and table controls',
    [
      'Ordered list',
      'Bullet list',
      'Task list',
      'Indent list item',
      'Footnote',
      'Insert table'
    ].every(
      (label) => shown.includes(label)
    ),
    shown
  );
  check(
    'the selection bar excludes sidebar and session controls',
    !shown.some((label) =>
      ['Toggle workspace sidebar', 'Push to the stack', 'Open the stack'].includes(label)
    ),
    shown
  );

  bar()?.querySelector('button[aria-label="Bold"]')?.click();
  await t.sleep(300);
  const formatted = await t.raw();
  check(
    'a selection-bar button runs its command on the selected text',
    formatted.startsWith('These **selected words** are here.'),
    formatted
  );

  window.getSelection()?.removeAllRanges();
  document.dispatchEvent(new Event('selectionchange'));
  await t.sleep(200);
  check(
    'collapsing the selection hides the toolbar',
    bar()?.classList.contains('hidden') ?? true,
    Boolean(bar())
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

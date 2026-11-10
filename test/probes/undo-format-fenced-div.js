/**
 * Undoing formatting in a theorem keeps the theorem rendered.
 *
 * A native context menu can temporarily lose the editor's tracked selection. Undo must use
 * the mark recorded by the edit, not that transient focus state, or it treats the restored
 * range as a caret and opens the fenced Div as one raw source block.
 *
 * @covers src/ui/markdown/editor/history.ts: applyEditorHistory,
 *   src/ui/markdown/editing/caret_placement.ts: showSourceAt
 */
(async () => {
  const t = window.__t;
  const { runCommand } = await t.app('/src/commands/runtime.ts');
  const caret = await t.app('/src/ui/markdown/caret/caret.ts');
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const body = 'Every theorem fixture has a body.';

  await t.load(
    '::: {#thm:fixture .Theorem info="The default theorem"}\n' +
      `${body}\n` +
      ':::\n'
  );
  const text = t.textNodesIn(t.prose()).find((node) => node.data.includes(body));
  const range = document.createRange();
  range.selectNodeContents(text);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  document.dispatchEvent(new Event('selectionchange'));
  await t.sleep(100);

  check(
    'the theorem starts rendered with its body selected',
    t.prose().querySelector('.markdown-theorem') !== null &&
      window.getSelection()?.toString() === body,
    {
      theorem: t.prose().querySelector('.markdown-theorem') !== null,
      selection: window.getSelection()?.toString() ?? null
    }
  );

  runCommand('format:bold', null, 'context-menu');
  await t.sleep(250);
  // A native popup can leave the editor focused but without its tracked selection.
  caret.setSelectionRange(null);
  await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'undo' });
  await t.sleep(300);

  const restored = window.getSelection()?.toString() ?? null;
  check(
    'undo restores the rendered theorem instead of opening its raw source',
    t.prose().querySelector('.markdown-theorem') !== null &&
      t.prose().querySelector('.markdown-fenced-div-source') === null,
    {
      theorem: t.prose().querySelector('.markdown-theorem') !== null,
      source: t.prose().querySelector('.markdown-fenced-div-source') !== null
    }
  );
  check(
    'and the theorem body is selected again',
    restored === body,
    restored
  );
  check(
    'the block remains visible',
    t.blocks()[0].checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }),
    t.blocks()[0].checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  );
  const restoredText = await t.raw();
  const original =
    '::: {#thm:fixture .Theorem info="The default theorem"}\n' + `${body}\n` + ':::\n';
  check('the document is back to the unformatted theorem', restoredText === original, restoredText);

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

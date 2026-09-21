(async () => {
  const t = window.__t;
  const emit = (event, payload) =>
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event, payload });
  const doc = ['| A | B |', '| :--- | --- |', '| 1 | 2 |', ''].join('\n');
  await t.load(doc);
  const cell = t.prose().querySelector('[data-table-cell="1:0"]');
  await t.click(cell ?? t.blocks()[0], 0.99);
  const target = { lineStart: 1, row: 1, column: 0 };

  await emit('table_command', { target, command: 'insertRowBelow' });
  await t.sleep(250);
  const insertedRow = await t.raw();
  t.report({ insertedRow });

  await emit('table_command', { target, command: 'alignRight' });
  await t.sleep(250);
  const aligned = await t.raw();

  await emit('undo', null);
  await t.sleep(250);
  const afterUndo = await t.raw();

  await emit('redo', null);
  await t.sleep(250);
  const afterRedo = await t.raw();

  return { insertedRow, aligned, afterUndo, afterRedo, caret: t.caretRect() };
})()

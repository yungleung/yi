/**
 * A table command chosen from the context menu reaches the table it was
 * captured for, and one undo takes it back.
 *
 * The menu itself is native, so nothing but a person can pick an item from it.
 * This probe takes the command an item names out of the same model the menu is
 * built from, and runs it through the registry the item runs it through — so a
 * command nobody registered, or an id the menu and the registry disagree about,
 * shows up here.
 *
 * @covers src/ui/table/index.ts, src/commands/runtime.ts
 */
(async () => {
  const t = window.__t;
  const emit = (event, payload) =>
    window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event, payload });
  const registry = await t.app('/src/commands/runtime.ts');
  const { readTableSource } = await t.app('/src/ui/markdown/syntax/table_source.ts');
  const { tableMenuModel } = await t.app('/src/ui/table/index.ts');
  const doc = ['| A | B |', '| :--- | --- |', '| 1 | 2 |', ''].join('\n');
  await t.load(doc);
  const cell = t.prose().querySelector('[data-table-cell="1:0"]');
  await t.click(cell ?? t.blocks()[0], 0.99);
  const target = { lineStart: 1, row: 1, column: 0 };

  const items = (nodes) =>
    nodes.flatMap((node) => (node.kind === 'submenu' ? items(node.items) : [node]));
  const menuItem = (id) =>
    items(tableMenuModel(readTableSource(doc), target.row, target.column)).find(
      (node) => node.kind === 'item' && node.id === id
    );
  const run = (id) => registry.runCommand(`table:${menuItem(id).command}`, target);

  const inserted = run('row-below');
  await t.sleep(250);
  const insertedRow = await t.raw();

  const aligned = run('align-right');
  await t.sleep(250);
  const alignedSource = await t.raw();

  await emit('undo', null);
  await t.sleep(250);
  const afterUndo = await t.raw();

  await emit('redo', null);
  await t.sleep(250);
  const afterRedo = await t.raw();

  return {
    inserted,
    aligned,
    insertedRow,
    alignedSource,
    afterUndo,
    afterRedo,
    caret: t.caretRect()
  };
})()

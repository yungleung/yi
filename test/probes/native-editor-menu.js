/**
 * Native editor-menu events reach the same commands as the title-bar buttons:
 * formatting, table choosing, sidebar visibility and the open stack list.
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const emit = async (event) => {
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event });
    await t.sleep(250);
  };

  const menu = await t.app('/src/commands/triggers/native_menu.ts');
  for (const [event, command] of [
    ['format_bold', 'format:bold'],
    ['insert_link', 'edit:insertLink'],
    ['choose_table', 'table:choose'],
    ['toggle_sidebar', 'view:toggleSidebar'],
    ['open_stack', 'session:openStack']
  ]) {
    check(
      `${event} maps to ${command}`,
      menu.commandForMenuEvent(event) === command,
      menu.commandForMenuEvent(event)
    );
  }

  await t.load('selected words\n');
  const node = t.textNodesIn(t.blocks()[0])[0];
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, node.data.length);
  window.getSelection()?.removeAllRanges();
  window.getSelection()?.addRange(range);
  await emit('format_bold');
  check(
    'the native formatting item edits the selection',
    (await t.raw()).startsWith('**selected words**'),
    await t.raw()
  );

  await t.load('First paragraph.\n');
  await t.click(t.blocks()[0]);
  await emit('choose_table');
  const picker = document.querySelector('[data-table-picker]');
  check(
    'the native table item opens the grid picker',
    picker?.classList.contains('hidden') === false,
    Boolean(picker)
  );
  picker?.querySelector('button[data-row="2"][data-column="3"]')?.click();
  await t.sleep(300);
  check(
    'the native table item inserts the picked table',
    (await t.raw()).includes('|  |  |  |\n| --- | --- | --- |'),
    await t.raw()
  );

  const sidebar = document.querySelector('[data-workspace-tree]')?.closest('aside');
  check('the sidebar starts visible', sidebar?.classList.contains('hidden') === false, Boolean(sidebar));
  await emit('toggle_sidebar');
  check('the native sidebar item hides it', sidebar?.classList.contains('hidden') === true, Boolean(sidebar));
  await emit('toggle_sidebar');
  check('and the same item shows it again', sidebar?.classList.contains('hidden') === false, Boolean(sidebar));

  await emit('open_stack');
  check(
    'the native session item opens the stack list',
    document.querySelector('[data-stack-list]')?.parentElement?.classList.contains('hidden') === false,
    document.querySelector('[data-stack-list]') !== null
  );

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

/**
 * Right-click routing: table cells keep the table menu, every other editor area
 * requests the general editor menu without opening a selection toolbar.
 *
 * @intercepts-menu — both menu handlers are replaced with recorders before the
 *   contextmenu gesture, so no native popup is opened during the suite.
 */
(async () => {
  const t = window.__t;
  const editorMenu = await t.app('/src/ui/markdown/editor_menu.ts');
  const tableMenu = await t.app('/src/ui/markdown/table_menu.ts');
  const tableUi = await t.app('/src/ui/table/menu.ts');
  const editorUi = await t.app('/src/ui/editor_context_menu/menu.ts');
  const editorRequests = [];
  const tableRequests = [];
  editorMenu.setEditorMenuHandler((request) => editorRequests.push(request));
  tableMenu.setTableMenuHandler((request) => tableRequests.push(request));

  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const rightClick = async (element, x, y) => {
    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 2
    });
    element.dispatchEvent(event);
    await t.sleep(150);
    return event.defaultPrevented;
  };

  try {
    await t.load('These selected words are here.\n');
    const node = t.textNodesIn(t.blocks()[0]).find((text) =>
      text.data.includes('selected words')
    );
    const range = document.createRange();
    range.setStart(node, node.data.indexOf('selected'));
    range.setEnd(node, node.data.indexOf('words') + 'words'.length);
    const box = range.getBoundingClientRect();
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    const selectedEvent = await rightClick(
      node.parentElement,
      box.right - 0.5,
      box.top + box.height / 2
    );
    check('right-click in prose is handled by the app', selectedEvent, true);
    check(
      'it requests one editor menu, not a floating toolbar',
      editorRequests.length === 1 && document.querySelector('[data-selection-toolbar]') === null,
      {
        requests: editorRequests.length,
        toolbar: document.querySelector('[data-selection-toolbar]')
      }
    );
    check(
      'a selected range reaches the menu as selected',
      editorRequests[0]?.hasSelection === true,
      editorRequests[0]
    );

    window.getSelection()?.removeAllRanges();
    await rightClick(
      node.parentElement,
      box.right - 0.5,
      box.top + box.height / 2
    );
    check(
      'a right-click elsewhere places the caret before opening the menu',
      editorRequests[1]?.hasSelection === false && editorRequests[1]?.hasCaret === true,
      editorRequests[1]
    );
    check(
      'the general editor menu ignores tables until one is under the pointer',
      tableRequests.length === 0,
      { table: tableRequests.length }
    );

    await t.load('| A |\n| --- |\n| 1 |\n');
    const cell = t.prose().querySelector('[data-table-cell="1:0"]');
    const cellBox = cell.getBoundingClientRect();
    await t.click(cell);
    const liveCell = t.prose().querySelector('[data-table-cell="1:0"]');
    editorRequests.length = 0;
    tableRequests.length = 0;
    const tableEvent = await rightClick(
      liveCell,
      cellBox.left + cellBox.width / 2,
      cellBox.top + cellBox.height / 2
    );
    check('right-click in a table cell is handled by the app', tableEvent, true);
    check(
      'the table cell requests only the table menu',
      tableRequests.length === 1 && editorRequests.length === 0,
      { table: tableRequests.length, editor: editorRequests.length }
    );
    check(
      'the table request names the clicked row and column',
      tableRequests[0]?.target?.row === 1 && tableRequests[0]?.target?.column === 0,
      tableRequests[0]?.target
    );

    await t.load('Alpha beta\n');
    const word = t.textNodesIn(t.blocks()[0])[0];
    const wordRange = document.createRange();
    wordRange.setStart(word, 0);
    wordRange.setEnd(word, 5);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(wordRange);
    document.dispatchEvent(new Event('selectionchange'));
    await t.sleep(80);
    t.scroller().dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'b',
        code: 'KeyB',
        metaKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    await t.sleep(250);
    const shortcutText = await t.raw();
    check(
      'the approved Cmd+B chord runs the same Bold command',
      shortcutText === '**Alpha** beta\n',
      shortcutText
    );

  } finally {
    editorMenu.setEditorMenuHandler((request) => {
      void editorUi.showEditorContextMenu(request);
    });
    tableMenu.setTableMenuHandler((request) => {
      void tableUi.showTableMenu(request.nodes, request.target, request.at);
    });
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

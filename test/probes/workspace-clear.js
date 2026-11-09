/**
 * A null workspace fact clears the tree instead of turning the event envelope into a path.
 *
 * @covers src/ui/workspace/tree/index.ts
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const rejections = [];
  const onRejection = (event) => rejections.push(String(event.reason));
  window.addEventListener('unhandledrejection', onRejection);

  const previous = await window.__TAURI_INTERNALS__.invoke('get_config');
  const fixture = `${window.__probePaths.checkout}test/fixtures/workspace`;
  try {
    await t.openWorkspace(fixture);
    check(
      'the fixture workspace is visible before it is cleared',
      document.querySelector('[data-tree-path]') !== null,
      document.querySelector('[data-workspace-tree]')?.textContent
    );

    const { eventManager } = await t.app('/src/services/events/index.ts');
    await eventManager.emit('workspace_changed', null);
    await t.sleep(300);
    check(
      'a null workspace shows the empty tree',
      document.querySelector('[data-tree-path]') === null &&
        document.querySelector('[data-workspace-tree]')?.textContent?.trim().length > 0,
      document.querySelector('[data-workspace-tree]')?.textContent
    );
    check('and no promise rejects while it clears', rejections.length === 0, rejections);
  } finally {
    await t.restoreWorkspace(previous);
    window.removeEventListener('unhandledrejection', onRejection);
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

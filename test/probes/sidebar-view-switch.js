/**
 * The status-bar switch loads Workspace or Contents into the sidebar shell.
 *
 * Only the selected view is mounted. The contents view lists document headings by level and
 * navigates to one when pressed.
 *
 * @covers src/ui/sidebar.ts, src/ui/sidebar_navigation.ts,
 *   src/ui/sidebar_toggle.ts, src/ui/status_bar/sidebar_view.ts,
 *   src/ui/table_of_contents/index.ts
 * @fixture test/fixtures/workspace/default-document.md
 * @needs-workspace
 *
 * Run with:
 *   npm run probe -- --with-workspace --fixture default-document.md \
 *     test/probes/sidebar-view-switch.js
 */
(async () => {
  const t = window.__t;
  const checks = [];
  const check = (name, actual, expected) =>
    checks.push({
      name,
      actual,
      expected,
      pass: JSON.stringify(actual) === JSON.stringify(expected)
    });

  const statusBar = document.querySelector('[data-status-bar]');
  const leftStatus = statusBar?.firstElementChild;
  const switchButton = document.querySelector('[data-sidebar-view-toggle]');
  const sidebar = document.querySelector('[data-sidebar]');
  const sidebarToggle = document.querySelector('[data-sidebar-toggle]');
  const sidebarWidth = sidebar?.getBoundingClientRect().width ?? 0;

  check('the workspace swap button is first at the status bar left', switchButton, leftStatus?.firstElementChild);
  check('the workspace swap button starts on Workspace', switchButton?.dataset.activeView, 'workspace');
  check(
    'the workspace swap button draws the supplied Workspace icon',
    switchButton?.innerHTML.includes('M20 10a1 1 0 0 0 1-1V6'),
    true
  );
  check('the sidebar toggle is a separate title-bar component', sidebar?.contains(sidebarToggle), false);
  check('the sidebar starts with only the Workspace view mounted', sidebar?.textContent.includes('README.md'), true);
  check('the Contents view is not mounted yet', document.querySelector('[data-table-of-contents]'), null);

  if (!switchButton || !sidebar) {
    return {
      checks,
      failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
    };
  }

  await t.click(switchButton, 0.5);
  await t.sleep(350);

  const contents = document.querySelector('[data-table-of-contents]');
  const entries = [...document.querySelectorAll('[data-toc-entry]')];
  const levels = entries.map((entry) => Number(entry.getAttribute('data-level')));
  check('the swap button switches to Contents', switchButton?.dataset.activeView, 'contents');
  check(
    'the swap button draws the supplied Contents icon',
    switchButton?.innerHTML.includes('M16 5H3m13 7H3m13 7H3'),
    true
  );
  check('Contents is loaded into the sidebar shell', contents?.parentElement?.hasAttribute('data-sidebar-content'), true);
  check('the Workspace view is no longer mounted', document.querySelector('[data-workspace-tree]'), null);
  check('switching views preserves the sidebar width', sidebar.getBoundingClientRect().width, sidebarWidth);
  check('the fixture headings have their own levels', levels.slice(0, 3), [1, 2, 2]);
  check(
    'the contents list includes the citation heading',
    entries.some((entry) => entry.textContent.trim() === 'Citations'),
    true
  );

  const citations = entries.find((entry) => entry.textContent.trim() === 'Citations');
  await t.click(citations, 0.5);
  await t.sleep(450);
  const heading = [...t.prose().querySelectorAll('.markdown-heading')].find(
    (candidate) => candidate.textContent.trim() === 'Citations'
  );
  const caret = t.caretRect();
  check('pressing a contents entry reaches its heading', Boolean(heading), true);
  checks.push({
    name: 'and puts the caret in that heading',
    actual: {
      active: document.activeElement?.className ?? document.activeElement?.tagName ?? null,
      caret,
      heading: heading ? t.rectOf(heading) : null,
      source: document.querySelector('.markdown-source-view')?.textContent ?? null
    },
    expected: true,
    pass: caret !== null
  });

  const longHeading =
    'A heading long enough to need wrapping inside the narrow sidebar without horizontal overflow';
  await t.load(`# ${longHeading}\n\n## Fresh child\n`);
  await t.sleep(400);
  check(
    'the mounted contents view follows the current document',
    [...document.querySelectorAll('[data-toc-entry]')].map((entry) => entry.textContent.trim()),
    [longHeading, 'Fresh child']
  );
  const longEntry = document.querySelector('[data-toc-entry]');
  check(
    'a long heading wraps without making Contents scroll horizontally',
    {
      contentFits: contents.scrollWidth <= contents.clientWidth,
      entryFits: longEntry.getBoundingClientRect().right <= contents.getBoundingClientRect().right,
      whiteSpace: getComputedStyle(longEntry).whiteSpace
    },
    { contentFits: true, entryFits: true, whiteSpace: 'normal' }
  );

  await t.click(sidebarToggle, 0.5);
  await t.sleep(200);
  check('the extracted title-bar toggle can hide Contents', sidebar.classList.contains('hidden'), true);

  await t.click(switchButton, 0.5);
  await t.sleep(200);
  check('switching while hidden loads Workspace again', switchButton?.dataset.activeView, 'workspace');
  check('and the Workspace view is mounted', Boolean(document.querySelector('[data-workspace-tree]')), true);
  check('while Contents is removed', document.querySelector('[data-table-of-contents]'), null);
  check('the view switch also reveals the sidebar', sidebar.classList.contains('hidden'), false);
  check('and restores its remembered width', sidebar.getBoundingClientRect().width, sidebarWidth);

  return {
    checks,
    failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name)
  };
})()

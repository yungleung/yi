/**
 * The workspace toggle belongs to the custom title bar. Windows and Linux have
 * native View menus instead, so their sidebar must not show a second toggle.
 */
(async () => {
  const checks = [];
  const check = (name, pass, actual) => checks.push({ name, pass, actual });
  const sidebar = document.querySelector('[data-workspace-tree]')?.closest('aside');
  const titleBar = document.querySelector('.titlebar');
  const toggle = document.querySelector('[data-sidebar-toggle]');
  const divider = sidebar?.nextElementSibling;

  check('the workspace sidebar is mounted', Boolean(sidebar), Boolean(sidebar));
  if (titleBar) {
    check(
      'the custom title bar owns the workspace toggle',
      titleBar.contains(toggle) && !sidebar?.contains(toggle),
      {
        parent: toggle?.parentElement?.className ?? null,
        inTitleBar: titleBar.contains(toggle),
        inSidebar: sidebar?.contains(toggle) ?? false
      }
    );
    const toggleRect = toggle?.getBoundingClientRect() ?? null;
    const dividerRect = divider?.getBoundingClientRect() ?? null;
    const toggleLeft = toggleRect ? Math.round(toggleRect.left) : null;
    const gapToDivider = toggleRect && dividerRect
      ? Math.round(dividerRect.left - toggleRect.right)
      : null;
    check(
      'the workspace toggle sits near the divider at its original offset',
      toggleLeft === 150 && gapToDivider >= 0 && gapToDivider <= 12,
      { toggleLeft, gapToDivider }
    );
  } else {
    check(
      'native window chrome shows no workspace toggle in the sidebar',
      !sidebar?.querySelector('[data-sidebar-toggle]') && toggle === null,
      toggle?.parentElement?.className ?? null
    );
  }

  return { checks, failed: checks.filter((entry) => !entry.pass).map((entry) => entry.name) };
})()

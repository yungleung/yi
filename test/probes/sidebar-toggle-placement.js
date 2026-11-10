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

  check('the workspace sidebar is mounted', Boolean(sidebar), Boolean(sidebar));
  if (titleBar) {
    check(
      'the custom title bar owns the workspace toggle',
      toggle?.parentElement === titleBar && titleBar.contains(toggle),
      toggle?.parentElement?.className ?? null
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

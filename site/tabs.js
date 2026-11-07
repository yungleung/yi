/**
 * Tab activation for the public site.
 *
 * Owns the WAI-ARIA tabs contract — one selected tab, roving `tabindex`, one
 * visible panel and Arrow/Home/End keyboard movement — and routes
 * `[data-activates]` links to the tab they name, so the header Templates and
 * Documentation links open the matching panel.
 */

/**
 * Selects `tab`, mirrors `aria-selected` and roving `tabindex`, and shows the
 * panel named by `aria-controls` while hiding the other tabs' panels.
 *
 * Example: with Templates selected, `activateTab(docsTab)` hides `#panel-templates`,
 * shows `#panel-docs` and moves `aria-selected` from the Templates tab to the Docs tab.
 */
export function activateTab(tab, moveFocus = false) {
  if (!tab || tab.getAttribute('role') !== 'tab') return;
  const tablist = tab.closest('[role="tablist"]');
  const tabs = tablist ? Array.from(tablist.querySelectorAll('[role="tab"]')) : [tab];

  for (const candidate of tabs) {
    const selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(candidate.getAttribute('aria-controls'));
    if (panel) panel.hidden = !selected;
  }

  if (moveFocus) tab.focus();
}

/**
 * Returns the tab `distance` steps away from `tabs[index]`, wrapping at both ends.
 *
 * Example: with tabs `[A, B, C]`, `stepTo(tabs, 0, -1)` is `C` and
 * `stepTo(tabs, 2, 1)` is `A`, so ArrowLeft on the first tab lands on the last.
 */
function stepTo(tabs, index, distance) {
  return tabs[(index + distance + tabs.length) % tabs.length];
}

/**
 * Wires tab buttons and `[data-activates]` links to `activateTab`.
 *
 * Example: clicking a header link with `data-activates="tab-docs"` selects and
 * focuses the Documentation tab, while its `#explore` href still scrolls the page.
 */
export function wireTabs(root = document) {
  for (const tab of root.querySelectorAll('[role="tab"]')) {
    tab.addEventListener('click', () => activateTab(tab));
  }

  for (const tablist of root.querySelectorAll('[role="tablist"]')) {
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    tablist.addEventListener('keydown', (event) => {
      if (!tabs.includes(event.target)) return;
      const index = tabs.indexOf(event.target);
      let target;
      if (event.key === 'ArrowRight') {
        target = stepTo(tabs, index, 1);
      } else if (event.key === 'ArrowLeft') {
        target = stepTo(tabs, index, -1);
      } else if (event.key === 'Home') {
        target = tabs[0];
      } else if (event.key === 'End') {
        target = tabs[tabs.length - 1];
      } else {
        return;
      }
      event.preventDefault();
      activateTab(target, true);
    });
  }

  for (const link of root.querySelectorAll('[data-activates]')) {
    link.addEventListener('click', () => {
      activateTab(document.getElementById(link.getAttribute('data-activates')), true);
    });
  }
}

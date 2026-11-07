/**
 * Tab activation for the public site.
 *
 * Owns the WAI-ARIA tabs contract — one selected tab, roving `tabindex`, one
 * visible panel and Arrow/Home/End keyboard movement — and routes
 * `[data-activates]` links to the tab they name, so the header Templates and
 * Documentation links open the matching panel. A successful activation also
 * announces a `yi:tabchange` fact with `detail.tabId`, which the Documentation
 * panel listens for to load its fragment.
 */

/**
 * Selects `tab`, mirrors `aria-selected` and roving `tabindex`, and shows the
 * panel named by `aria-controls` while hiding the other tabs' panels.
 *
 * Example: with Templates selected, `activateTab(docsTab)` hides `#panel-templates`,
 * shows `#panel-docs` and moves `aria-selected` from the Templates tab to the Docs tab.
 */
export function activateTab(tab, moveFocus = false) {
  if (
    !tab ||
    typeof tab.getAttribute !== 'function' ||
    tab.getAttribute('role') !== 'tab'
  ) {
    return false;
  }
  const controls = tab.getAttribute('aria-controls');
  if (
    !controls ||
    typeof document === 'undefined' ||
    typeof document.getElementById !== 'function' ||
    !document.getElementById(controls)
  ) {
    return false;
  }
  const tablist = tab.closest('[role="tablist"]');
  const tabs = tablist ? Array.from(tablist.querySelectorAll('[role="tab"]')) : [tab];

  for (const candidate of tabs) {
    const selected = candidate === tab;
    candidate.setAttribute('aria-selected', String(selected));
    candidate.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(candidate.getAttribute('aria-controls'));
    if (panel) panel.hidden = !selected;
  }

  if (moveFocus && typeof tab.focus === 'function') tab.focus();
  if (
    typeof document !== 'undefined' &&
    typeof CustomEvent !== 'undefined' &&
    typeof document.dispatchEvent === 'function'
  ) {
    document.dispatchEvent(new CustomEvent('yi:tabchange', { detail: { tabId: tab.id } }));
  }
  return true;
}

/**
 * Returns the index selected by an Arrow, Home or End key, wrapping at both ends.
 *
 * Example: `tabTargetIndex(0, 3, 'ArrowLeft')` is `2`, while
 * `tabTargetIndex(2, 3, 'ArrowRight')` is `0`.
 */
export function tabTargetIndex(index, count, key) {
  if (
    !Number.isInteger(index) ||
    !Number.isInteger(count) ||
    count <= 0 ||
    index < 0 ||
    index >= count
  ) {
    return -1;
  }
  if (key === 'ArrowRight') return (index + 1) % count;
  if (key === 'ArrowLeft') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return -1;
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
      const targetIndex = tabTargetIndex(index, tabs.length, event.key);
      if (targetIndex < 0) return;
      event.preventDefault();
      activateTab(tabs[targetIndex], true);
    });
  }

  for (const link of root.querySelectorAll('[data-activates]')) {
    link.addEventListener('click', () => {
      activateTab(document.getElementById(link.getAttribute('data-activates')), true);
    });
  }
}

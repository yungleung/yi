import darkUrl from 'highlight.js/styles/tokyo-night-dark.css?url';
import lightUrl from 'highlight.js/styles/tokyo-night-light.css?url';

const LINK_ID = 'hljs-theme';

function ensureLink(): HTMLLinkElement {
  let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.id = LINK_ID;
    document.head.appendChild(link);
  }
  return link;
}

function isAppDark(): boolean {
  const html = document.documentElement;
  const dataTheme = (html.getAttribute('data-theme') || '').toLowerCase();
  if (dataTheme.includes('dark')) return true;
  if (html.classList.contains('dark')) return true;
  // fallback to system preference
  try {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (e) {
    return false;
  }
}

function applyTheme() {
  const link = ensureLink();
  link.href = isAppDark() ? darkUrl : lightUrl;
}

export function initHighlightTheme() {
  // Apply immediately
  applyTheme();

  // Watch for system theme changes
  try {
    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', () => applyTheme());
    } else if (mq && typeof (mq as any).addListener === 'function') {
      (mq as any).addListener(() => applyTheme());
    }
  } catch (e) {
    // ignore
  }

  // Watch for changes to <html> attributes (data-theme or class changes)
  const observer = new MutationObserver(() => {
    applyTheme();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
}

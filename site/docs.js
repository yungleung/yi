/**
 * Documentation sidebar behaviour for the public site.
 *
 * Owns the table of contents: it collapses the TOC into a disclosure on small
 * screens, tracks the rendered article headings with an IntersectionObserver,
 * marks the active heading's link with `aria-current`, and intercepts TOC
 * clicks so a jump clears the sticky header and records the fragment without a
 * page reload. Loading the fragment itself stays in `app.js`, which owns the
 * COPY strings and the language lifecycle.
 */

const READING_BAND = 0.28;
const MOBILE_QUERY = '(max-width: 960px)';

/**
 * Chooses the heading to highlight.
 *
 * The last heading intersecting the reading band wins; when the band is empty
 * the nearest heading above it stays active, so scrolling past a section does
 * not clear the TOC.
 *
 * Example: headings at tops `[-40, 80, 400]` with the band ending at `300` and
 * only the first two intersecting select the second — the section the reader
 * is entering.
 */
export function selectActiveHeading(headings, intersecting, bandBottom) {
  let active = null;
  for (const heading of headings) {
    if (intersecting.has(heading.id)) active = heading;
  }
  if (active) return active;
  for (const heading of headings) {
    if (heading.top <= bandBottom) active = heading;
  }
  return active;
}

/**
 * Wires the TOC inside `root` (the `[data-doc-body]` element holding a freshly
 * loaded fragment) and returns a teardown that disconnects the observer.
 */
export function trackDocumentationHeadings(root) {
  const toc = root.querySelector('[data-doc-toc]');
  const headings = Array.from(
    root.querySelectorAll('.docs-article h2[id], .docs-article h3[id]')
  );

  const linksByTarget = new Map();
  for (const link of toc ? toc.querySelectorAll('a[href^="#"]') : []) {
    linksByTarget.set(link.getAttribute('href').slice(1), link);
  }
  const links = new Map();
  for (const heading of headings) {
    const link = linksByTarget.get(heading.id);
    if (link) links.set(heading, link);
  }

  const readingTop = () => window.innerHeight * READING_BAND;
  const visible = new Set();
  let observer = null;

  const sync = () => {
    const model = headings.map((heading) => ({
      id: heading.id,
      top: heading.getBoundingClientRect().top
    }));
    const active = selectActiveHeading(model, visible, readingTop());
    for (const heading of headings) {
      const link = links.get(heading);
      if (!link) continue;
      if (active && heading.id === active.id) {
        link.setAttribute('aria-current', 'location');
      } else {
        link.removeAttribute('aria-current');
      }
    }
  };

  if (typeof IntersectionObserver !== 'undefined' && headings.length > 0) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        sync();
      },
      { rootMargin: `0px 0px -${READING_BAND * 100}% 0px`, threshold: 0 }
    );
    for (const heading of headings) observer.observe(heading);
  }
  sync();

  for (const link of links.values()) {
    link.addEventListener('click', (event) => {
      const targetId = link.getAttribute('href')?.slice(1);
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ block: 'start' });
      history.replaceState(null, '', `#${targetId}`);
    });
  }

  const mobile = typeof window !== 'undefined' ? window.matchMedia(MOBILE_QUERY) : null;
  const collapseToc = () => {
    if (toc) toc.open = mobile ? !mobile.matches : true;
  };
  collapseToc();
  if (mobile && typeof mobile.addEventListener === 'function') {
    mobile.addEventListener('change', collapseToc);
  }

  return () => {
    observer?.disconnect();
    if (mobile && typeof mobile.removeEventListener === 'function') {
      mobile.removeEventListener('change', collapseToc);
    }
  };
}

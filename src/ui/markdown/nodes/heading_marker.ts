/**
 * The decorative marker that names a heading's level.
 *
 * It is a generated element, not document content: its SVG is hidden from assistive technology,
 * its pointer events are disabled, and it contributes no text to copying or caret offsets.
 *
 * May import: nothing. Upholds: one supplied glyph for each h1-h6 depth, with no state of its own.
 */

const HEADING_MARKERS = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
    '<path d="M0 0h24v24H0z" fill="none" />' +
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-2.9-14.74h2.9m-12 0h2.9m-2.9 14.74h2.9m12.07-2.65l1.3-1.15c.72-.65 1.08-.97 1.37-.84s.3.61.3 1.58v5" />' +
    '</svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
    '<path d="M0 0h24v24H0z" fill="none" />' +
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.54 15.26c.5-.54.99-.96 2.02-.96c1.82 0 2.11 1.9 1.2 2.84c-.53.56-1.7 1.39-2.61 2.18c-.45.38-.67.58-.55.9s.44.33 1.09.33h2.58M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-2.9-14.74h2.9m-12 0h2.9m-2.9 14.74h2.9" />' +
    '</svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
    '<path d="M0 0h24v24H0z" fill="none" />' +
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-2.9-14.74h2.9m-12 0h2.9m-2.9 14.74h2.9m12.01-3.73a2.2 2.2 0 0 1 1.75-.74c1.57 0 2.04 1.81 1.25 2.54c-.8.73-1.95.57-1.95.57" />' +
    '<path d="M17.64 19.8c.43.42.85.75 1.75.75c1.57 0 2.04-1.81 1.25-2.55c-.8-.73-1.95-.56-1.95-.56" />' +
    '</g></svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
    '<path d="M0 0h24v24H0z" fill="none" />' +
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20.44 21.18v-4.9c0-1.33 0-2-.36-2.11c-.35-.11-.72.45-1.47 1.56l-.93 1.39c-.46.68-.69 1.02-.55 1.29c.14.26.56.26 1.38.26h3.1M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-12 0h2.9m6.2-14.74h2.9m-12 0h2.9" />' +
    '</svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
    '<path d="M0 0h24v24H0z" fill="none" />' +
    '<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-12 0h2.9m6.2-14.74h2.9m-12 0h2.9M17.78 21h1.6a1.76 1.76 0 1 0 0-3.53h-1.82v-1.52c0-.5 0-.74.08-.93a1 1 0 0 1 .51-.51c.2-.09.44-.09.93-.09h1.7" />' +
    '</svg>',
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">' +
    '<path d="M0 0h24v24H0z" fill="none" />' +
    '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M4.18 4.03v14.74m9.1-14.74v14.74m-9.1-7.47h9.1m0-7.27v14.74m-1.45 0h2.9m-12 0h2.9m6.2-14.74h2.9m-12 0h2.9" />' +
    '<circle cx="19.24" cy="19.34" r="1.87" transform="rotate(90 19.24 19.34)" />' +
    '<path d="M17.38 19.23c0-1.24 0-4.35 2.88-5.2" />' +
    '</g></svg>'
] as const;

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** The decorative marker for a heading level. */
export function headingMarker(level: HeadingLevel): HTMLSpanElement {
  const marker = document.createElement('span');
  marker.className = 'markdown-heading-marker';
  marker.setAttribute('data-heading-marker', String(level));
  marker.setAttribute('aria-hidden', 'true');
  marker.innerHTML = HEADING_MARKERS[level - 1];
  return marker;
}

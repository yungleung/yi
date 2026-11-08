/**
 * Activates documentation TOC tracking on the generated standalone pages.
 *
 * Example: `/documentation/en-page.html` calls this module after the static
 * article and TOC are parsed, allowing `docs.js` to highlight the current heading.
 */
import { trackDocumentationHeadings } from './docs.js';

const page = document.querySelector('.standalone-docs');
if (page) trackDocumentationHeadings(page);

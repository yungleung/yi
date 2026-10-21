/**
 * The bundled Documentation guide.
 *
 * The guide has no workspace path and no fetched resources: it is one markdown document imported
 * into the window, so it reads the same wherever the app is opened.
 *
 * May import: Vite’s raw markdown loader. Upholds: one source for the text Documentation opens.
 */

import text from './documentation.en.md?raw';

export function documentationText(): string {
  return text;
}

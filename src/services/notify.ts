/**
 * Telling the reader that something did not work.
 *
 * Every failure the app can do nothing about — a file the backend refused to write, a folder it
 * could not read, a clipboard it may not look at — reaches the reader the same way: the toast the
 * app already has, carrying the backend's own sentence rather than a rewrite of it, and the
 * console keeps the error itself for whoever is reading a log. The *context* each caller names is
 * what the console line starts with, because by the time a toast is on screen the reader needs the
 * sentence, not the diagnosis.
 *
 * May import: the event manager and the toast event. Upholds: one way to say "that did not work",
 * so no feature invents a second one (a thrown error the reader never sees is not one).
 */

import { eventManager } from './event_manager';
import { TOAST_EVENT } from './workspace';

export function notify(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${context}:`, error);
  void eventManager.emit(TOAST_EVENT, message);
}

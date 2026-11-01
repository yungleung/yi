/**
 * Telling the reader that something needs their attention: a failure the app can do nothing about,
 * carrying the backend's own sentence.
 *
 * A message is the app's loud surface: it waits for the reader — the ✕, or Escape — and it is shown
 * in the window's corner whatever it is about. Something the reader does *not* have to act on (a
 * path copied) is a hint instead (`services/hints.ts`): a card beside the thing it happened on,
 * which goes away as soon as the reader does anything else.
 *
 * May import: the event manager. Upholds: one way to say something to the reader, so no feature
 * invents a second one, and no message is buried where the reader would have to go looking for it.
 */

import { eventManager } from './events';

/** What the app tells the reader. */
export interface Message {
  text: string;
}

/** Emitted with a `Message` whenever the app has something to say. */
export const MESSAGE_EVENT = 'message';

/** Shows a message the app has already worded for the reader. */
export function showMessage(text: string): void {
  void eventManager.emit(MESSAGE_EVENT, { text } satisfies Message);
}

/**
 * Something needs the reader's attention: the backend's own sentence reaches them, and the
 * diagnosis stays in the console under the context the caller names.
 */
export function notify(context: string, error: unknown): void {
  const text = error instanceof Error ? error.message : String(error);
  console.error(`${context}:`, error);
  showMessage(text);
}

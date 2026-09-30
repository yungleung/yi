/**
 * Telling the reader something: a failure the app can do nothing about, or a confirmation like a
 * copied path. One event carries both, and where a message belongs travels with it.
 *
 * The place is a *name*, never an element: the event bus is Tauri's (`emit` serialises its
 * payload), so a DOM node cannot ride it. Two names are enough for every caller — a workspace path,
 * which means the tree's row for that file, and a command id, which means the button that ran it.
 * `placeSelector` turns either into the selector the message surface looks for; a message that
 * names neither, or names one that is not on screen, lands in the window's corner.
 *
 * May import: the event manager. Upholds: one way to say something to the reader, so no feature
 * invents a second one, and one place where a message's home is written down.
 */

import { eventManager } from './event_manager';

/** What a message is about: the row of a workspace file, or the button that ran a command. */
export type MessagePlace = { path: string } | { command: string };

/** What the app tells the reader. */
export interface Message {
  text: string;
  at?: MessagePlace;
}

/** Emitted with a `Message` whenever the app has something to say. */
export const MESSAGE_EVENT = 'message';

/** A CSS string: a quote, a backslash or a newline in a file name must not break the selector. */
function attributeValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\a ');
}

/**
 * The selector a place is found by, or null for a message that names no place. Pure: the surface
 * does the looking, this only says what to look for.
 */
export function placeSelector(place: MessagePlace | undefined): string | null {
  if (!place) {
    return null;
  }
  return 'path' in place
    ? `[data-tree-path="${attributeValue(place.path)}"]`
    : `[data-command="${attributeValue(place.command)}"]`;
}

/**
 * Something did not work: the backend's own sentence reaches the reader, and the diagnosis stays in
 * the console under the context the caller names.
 */
export function notify(context: string, error: unknown, at?: MessagePlace): void {
  const text = error instanceof Error ? error.message : String(error);
  console.error(`${context}:`, error);
  void eventManager.emit(MESSAGE_EVENT, { text, at } satisfies Message);
}

/**
 * Chords to command ids.
 *
 * Example: `Cmd+H` resolves to `find:replace`; this module names the request
 * but does not implement opening or replacing.
 *
 * May import: the command ids only. Upholds: a key that asks for a command
 * resolves through the one catalogue, never through its own behaviour.
 */

import type { CommandId } from '../contracts';

interface Chord {
  key: string;
  shift?: boolean;
  alt?: boolean;
}

/** The chords the editor answers, and the command each runs. */
const CHORDS: Readonly<Record<string, CommandId>> = {
  z: 'history:undo',
  'shift+z': 'history:redo',
  x: 'edit:cut',
  a: 'edit:selectAll',
  f: 'find:open',
  h: 'find:replace',
  p: 'session:toggleStack',
  t: 'session:nextStacked',
  'shift+t': 'session:previousStacked',
  'shift+r': 'edit:insertRule',
  b: 'format:bold',
  i: 'format:italic',
  'shift+x': 'format:strikethrough',
  e: 'format:inlineCode',
  k: 'edit:insertLink',
  'shift+i': 'edit:insertImage',
  'alt+f': 'edit:insertFootnote'
};

/** The command a keyboard event asks for, or null when it is not a chord. */
export function commandForKey(
  event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'key' | 'code'>
): CommandId | null {
  if (!(event.metaKey || event.ctrlKey)) {
    return null;
  }
  // Option changes `key` to a composed character on macOS (`Option+F` is `ƒ`);
  // the physical letter stays in `code`, so every chord keeps one spelling.
  const codeLetter = /^Key([A-Z])$/.exec(event.code)?.[1].toLowerCase();
  const chord: Chord = {
    key: codeLetter ?? event.key.toLowerCase(),
    shift: event.shiftKey,
    alt: event.altKey
  };
  const spelling = [
    chord.alt ? 'alt' : null,
    chord.shift ? 'shift' : null,
    chord.key
  ]
    .filter((part): part is string => part !== null)
    .join('+');
  return CHORDS[spelling] ?? null;
}

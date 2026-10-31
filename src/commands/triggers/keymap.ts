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
  'shift+r': 'edit:insertRule'
};

/** The command a keyboard event asks for, or null when it is not a chord. */
export function commandForKey(event: KeyboardEvent): CommandId | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return null;
  }
  const chord: Chord = { key: event.key.toLowerCase(), shift: event.shiftKey };
  return CHORDS[`${chord.shift ? 'shift+' : ''}${chord.key}`] ?? null;
}

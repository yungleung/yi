/**
 * Chords to commands.
 *
 * The keyboard is a trigger like a toolbar button: it names a command rather
 * than doing the work itself. Text entry is deliberately not here — typing,
 * `Enter`, `Backspace`, `Tab` and the arrows are the text path, and they stay in
 * the editor's keydown handler.
 *
 * May import: the command ids (`./registry`) and nothing else — a chord is a
 * name, not an action. Upholds: a key that names a command is looked up here and
 * run by the editor; a key that does not is left to the browser.
 */
import type { CommandId } from './registry';

interface Chord {
  key: string;
  shift?: boolean;
}

/** The chords the editor answers, and the command each runs. */
const CHORDS: Readonly<Record<string, CommandId>> = {
  'z': 'history:undo',
  'shift+z': 'history:redo',
  'x': 'edit:cut',
  'a': 'edit:selectAll',
  'f': 'find:open',
  'h': 'find:replace',
  'p': 'session:toggleStack',
  't': 'session:nextStacked',
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

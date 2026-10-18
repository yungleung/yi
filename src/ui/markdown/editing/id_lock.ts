/**
 * The frontmatter `id:` line is the note's own name, and the app keeps it.
 *
 * The line is pinned: a write that would change it — a character typed into the value, a line
 * deleted into another, a paste or a replace crossing it — is refused. The newlines on either
 * side are part of the pin because deleting one would join the id to a neighbouring line, which
 * changes it just as surely as typing over it.
 *
 * May import: the identity rule that says where the line is. Upholds: only edits that leave the
 * `id:` line byte for byte as it was are allowed through.
 */

import { idLineRange } from '../../../services/document_identity';

/** Whether replacing `[from, to)` with anything would change the frontmatter's id line. */
export function editsId(content: string, from: number, to: number): boolean {
  const line = idLineRange(content);
  if (!line) {
    return false;
  }
  // The line's own newline, and the one before it: either joins it to a neighbour when removed.
  const guardStart = line.start > 0 ? line.start - 1 : line.start;
  const guardEnd = content[line.end] === '\n' ? line.end + 1 : line.end;
  if (from === to) {
    // A caret at the line's start writes *before* it; one inside the line, or at its end, is
    // writing into the id.
    return from > line.start && from <= line.end;
  }
  return from < guardEnd && to > guardStart;
}

/**
 * Jumps from a same-document fragment to its shared reference target.
 *
 * The target comes from the document index, so the gesture works for headings
 * and for later target kinds outside the mounted viewport. The editor reveals
 * the target and never lets the webview navigate to `location.hash`.
 *
 * May import: the document index, localized messages and the editing context.
 * Upholds: navigation is derived from the document text, never from the
 * currently mounted DOM.
 */

import { firstReference } from '../document/reference_index';
import { restoreCaret, type EditorContext } from './context';

/** Resolve and focus a reference fragment. Missing targets are handled and reported. */
export function jumpToReference(context: EditorContext, destination: string): boolean {
  let id: string;
  try {
    id = decodeURIComponent(destination.trim().slice(1));
  } catch {
    return false;
  }
  const target = firstReference(context.state.referenceEntries(), id);
  if (!target) {
    context.host.notify({ kind: 'message', code: 'reference.notFound', params: { id } });
    return true;
  }
  context.renderer.revealOffset(target.from);
  return restoreCaret(context, target.caretAt ?? target.from);
}

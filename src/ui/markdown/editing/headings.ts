/**
 * Jumps from a same-document fragment to the heading it names.
 *
 * The target comes from the document's cached heading index, so the gesture
 * works for a heading outside the mounted viewport. The editor reveals the
 * target block and puts the caret on the heading without letting the webview
 * navigate to `location.hash`.
 *
 * May import: the document index and the editing context. Upholds: navigation
 * is derived from the document text, never from the currently mounted DOM.
 */

import { firstHeadingTarget } from '../document/heading_index';
import { showMessage } from '../../../services/messages';
import { t } from '../../../services/i18n';
import { restoreCaret, type EditorContext } from './context';

/** Resolve and focus a heading fragment. Missing targets are handled and reported. */
export function jumpToHeading(context: EditorContext, destination: string): boolean {
  let id: string;
  try {
    id = decodeURIComponent(destination.trim().slice(1));
  } catch {
    return false;
  }
  const target = firstHeadingTarget(context.state.headingTargets(), id);
  if (!target) {
    showMessage(t('heading.notFound', { id }));
    return true;
  }
  context.renderer.revealOffset(target.from);
  return restoreCaret(context, target.from);
}

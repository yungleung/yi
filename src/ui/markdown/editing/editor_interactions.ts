/**
 * Installs the editor's pointer, clipboard, preview, context-menu and document-
 * selection listeners.
 *
 * Example: a captured checkbox click toggles its source before caret routing,
 * while a plain click closes the completion list and places the caret.
 *
 * May import: click routing, previews, clipboard/edit selection and the edit
 * context. Upholds: listener order stays explicit, and read-only documents keep
 * copy/navigation while refusing writes.
 */

import type { EditorContext } from './context';
import { copySelection, pasteText } from './clipboard';
import { isDocumentRange } from './selection';
import { watchPointerPresses } from './pointer';
import { installCitationPreview } from '../citation_preview';
import { installFootnotePreview } from '../footnote_preview';
import {
  routeContextMenu,
  routeFootnoteClick,
  routeFootnoteMenu,
  routeLinkClick,
  routePointerClick,
  routeTaskClick,
  routeWikilinkClick
} from '../click_routing';
import { setSelectionRange } from '../caret/caret';

export interface EditorInteractionOptions {
  readonly contentView: HTMLElement;
  readonly context: EditorContext;
  readOnly(): boolean;
  closeCompletions(): void;
}

export function installEditorInteractions({
  contentView,
  context,
  readOnly,
  closeCompletions
}: EditorInteractionOptions): void {
  contentView.addEventListener(
    'click',
    (event) => {
      if (!readOnly()) {
        routeTaskClick(context, event);
      }
    },
    true
  );
  contentView.addEventListener('click', (event) => routeFootnoteClick(context, event), true);
  contentView.addEventListener('click', (event) => routeLinkClick(context, event), true);
  contentView.addEventListener('click', (event) => routeWikilinkClick(event), true);
  watchPointerPresses(contentView);
  contentView.addEventListener('click', (event) => routePointerClick(context, event));
  contentView.addEventListener('click', () => closeCompletions(), true);
  installFootnotePreview(context);
  installCitationPreview(context);
  contentView.addEventListener('contextmenu', (event) => {
    routeFootnoteMenu(context, event);
    if (!readOnly()) {
      routeContextMenu(context, event);
    }
  });
  contentView.addEventListener('copy', (event) => copySelection(context, event));
  contentView.addEventListener('paste', (event) => {
    if (readOnly()) {
      event.preventDefault();
      return;
    }
    pasteText(context, event);
  });

  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setSelectionRange(null);
      return;
    }
    const range = selection.getRangeAt(0);
    setSelectionRange(
      !range.collapsed && isDocumentRange(context, range) ? range : null
    );
  });
}

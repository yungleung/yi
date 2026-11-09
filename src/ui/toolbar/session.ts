/**
 * The session button: shows whether the document on screen is in the stack, and opens the panel that
 * switches between the documents that are.
 *
 * May import: the session, its news, the stack panel, the catalogue and the toolbar base. Upholds:
 * the button's state is read from the session, never kept locally, so it cannot show a stack the
 * session does not have.
 */

import { eventManager } from '../../services/events';
import { DOCUMENT_SESSION_CHANGED, documentSession } from '../../services/session';
import { runCommand } from '../../commands/runtime';
import { StackPopover } from '../session';
import { boxOf } from '../floating';
import { t } from '../../services/i18n';
import { TOOL_ICON_SIZE, Toolbar } from '../toolbar';

/** The glyph the user sent for taking a document out of the stack. */
const STACK_POP =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">' +
  '<path d="M0 0h16v16H0z" fill="none" />' +
  '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
  '<path d="m4.25 6.75-2.5 1.25 6.25 3.25 6.25-3.25-2.5-1.25m-10 4.25 6.25 3.25 6.25-3.25" />' +
  '<path d="m8 8.25v-6.5m-2.25 2 2.25-2 2.25 2" />' +
  '</g>' +
  '</svg>';

/** …and for putting one in. The two are the same tray, with the arrow the other way. */
const STACK_PUSH =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">' +
  '<path d="M0 0h16v16H0z" fill="none" />' +
  '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
  '<path d="m3.25 7.25-1.5.75 6.25 3.25 6.25-3.25-1.5-.75m-11 3.75 6.25 3.25 6.25-3.25" />' +
  '<path d="m8 8.25v-6.5m-2.25 4.5 2.25 2 2.25-2" />' +
  '</g>' +
  '</svg>';

/** The layered sheets the user sent, for the button that opens the stack. */
const STACK_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 56 56">' +
  '<path d="M0 0h56v56H0z" fill="none" />' +
  '<path fill="currentColor" d="M28.012 31.68c.937 0 1.851-.305 2.976-.961l18.352-10.64c1.875-1.102 2.625-1.97 2.625-3.259c0-1.265-.75-2.133-2.625-3.234L30.988 2.946c-1.125-.657-2.039-.962-2.976-.962c-.961 0-1.852.305-2.977.961L6.684 13.585c-1.875 1.102-2.625 1.97-2.625 3.235c0 1.29.75 2.157 2.625 3.258l18.351 10.64c1.125.657 2.016.962 2.977.962m0-4.078c-.329 0-.657-.118-1.032-.329L9.121 17.055c-.094-.047-.164-.117-.164-.235c0-.093.07-.164.164-.21l17.86-10.22c.374-.21.702-.327 1.03-.327s.657.117 1.032.328l17.836 10.218c.117.047.188.118.188.211c0 .117-.071.188-.188.235L29.043 27.273c-.375.211-.703.329-1.031.329m0 15.632c.843 0 1.57-.398 2.554-.984L50.7 30.367c.89-.539 1.266-1.312 1.266-2.039c0-.96-.703-1.758-1.336-2.062L28.902 38.805c-.328.187-.633.328-.89.328c-.258 0-.563-.14-.891-.328L5.394 26.265c-.656.305-1.359 1.102-1.359 2.063c0 .727.422 1.524 1.29 2.04L25.456 42.25c.984.586 1.687.984 2.555.984m0 10.782c.843 0 1.57-.399 2.554-.985L50.7 41.148c.867-.492 1.266-1.312 1.266-2.039c0-.96-.703-1.734-1.336-2.062L28.902 49.609c-.328.188-.633.328-.89.328c-.258 0-.563-.14-.891-.328L5.394 37.047c-.656.328-1.359 1.101-1.359 2.062c0 .727.422 1.547 1.29 2.04L25.456 53.03c.984.586 1.687.985 2.555.985" />' +
  '</svg>';

/**
 * The two buttons at the right of the titlebar that keep documents: the stack toggle, which
 * draws `stack-push` while the document on screen is not in the stack and `stack-pop` while it
 * is, and the button that opens the stack to bring one back.
 *
 * Both do what the layout button does: they name a command and let the owner decide — the
 * session, through `session/commands.ts` — and they hear the session's news to draw the state
 * in hand rather than keeping one of their own.
 */
export class SessionToolbar extends Toolbar {
  private readonly stackButton: HTMLButtonElement;
  private readonly popover: StackPopover;

  constructor(popover: StackPopover) {
    super(['flex', 'items-center', 'gap-1']);
    this.popover = popover;
    this.stackButton = this.addButton(
      { label: t('session.push'), icon: STACK_PUSH, className: TOOL_ICON_SIZE },
      () => {
        runCommand('session:toggleStack', null, 'toolbar');
      }
    );
    this.addButton(
      { label: t('session.open'), icon: STACK_OPEN, className: TOOL_ICON_SIZE },
      () => {
        this.popover.toggleAt(() => boxOf(this.stackButton));
      }
    );
    this.showStack(false);
    void eventManager.on(DOCUMENT_SESSION_CHANGED, () => {
      this.showStack(documentSession.current()?.stacked === true);
    });
  }

  /** The icon says whether the document is in the stack; the tooltip says what a press does. */
  private showStack(stacked: boolean): void {
    this.stackButton.innerHTML = stacked ? STACK_POP : STACK_PUSH;
    this.stackButton.title = stacked ? t('session.pop') : t('session.push');
    this.stackButton.setAttribute('aria-label', this.stackButton.title);
    this.stackButton.setAttribute('aria-pressed', String(stacked));
  }
}

import { runCommand } from '../markdown/commands/registry';
import { t } from '../../services/i18n';
import { TOOL_ICON_SIZE, Toolbar } from './toolbar';

const LINK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 16 16">' +
  '<path d="M0 0h16v16H0z" fill="none" />' +
  '<g fill="currentColor">' +
  '<path d="M4.715 6.542L3.343 7.914a3 3 0 1 0 4.243 4.243l1.828-1.829A3 3 0 0 0 8.586 5.5L8 6.086a1 1 0 0 0-.154.199a2 2 0 0 1 .861 3.337L6.88 11.45a2 2 0 1 1-2.83-2.83l.793-.792a4 4 0 0 1-.128-1.287z" />' +
  '<path d="M6.586 4.672A3 3 0 0 0 7.414 9.5l.775-.776a2 2 0 0 1-.896-3.346L9.12 3.55a2 2 0 1 1 2.83 2.83l-.793.792c.112.42.155.855.128 1.287l1.372-1.372a3 3 0 1 0-4.243-4.243z" />' +
  '</g>' +
  '</svg>';

/**
 * The link button at the titlebar's centre, beside the inline styles it is not one
 * of: pressing it runs `edit:insertLink`, which writes `[title](destination)` where
 * the caret is (or around the selection, which becomes the title) and fills the
 * destination from the clipboard when the clipboard holds a URL.
 *
 * Like every tool button it must not start a window drag and must not take focus —
 * the caret the command writes at lives in the document, and a focused button would
 * take it away.
 */
export class LinkToolbar extends Toolbar {
  constructor() {
    super();
    this.addButton({ label: t('toolbar.link'), icon: LINK_ICON, className: TOOL_ICON_SIZE }, () => {
      runCommand('edit:insertLink');
    });
  }
}
